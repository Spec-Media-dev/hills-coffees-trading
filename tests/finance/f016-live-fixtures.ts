/** Test-owned commerce graphs; no writes or connections at import time. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { F013_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";
import { assertF016LiveTarget, executeF016Sql } from "@/scripts/f016-live-target";
import { withLiveSession, type LiveSession } from "./f016-live-session";

export const BUYER_EMAIL = F013_FIXTURES.members.buyerA.email;
export const FINANCE_EMAIL = F013_FIXTURES.operators.finance.email;
const WAREHOUSE_EMAIL = F013_FIXTURES.operators.warehouse.email;
export function id(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("f016_invalid_uuid");
  return value;
}
export const sql = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export async function runSql(statement: string): Promise<void> {
  if (await executeF016Sql(statement) !== 0) throw new Error("f016_sql_failed");
}
export const OWNED_TABLES = [
  "shipment_items", "order_shipments", "tax_invoices", "storage_allocations", "inventory_ownership_events",
  "notifications", "notification_events", "audit_logs", "payment_reviews", "commerce_request_log",
  "proforma_line_economics", "proforma_seller_settlements", "proforma_bank_instructions",
  "payment_proof_upload_intents", "payment_proofs", "file_assets", "inventory_reservation_items",
  "payments", "inventory_reservations", "proforma_invoice_items", "proforma_fulfillment_groups",
  "order_financials", "order_status_history", "proforma_invoices", "order_items", "orders",
  "delivery_destinations", "listing_status_history", "coffee_offers", "inventory_positions",
  "coffee_lots", "coffees", "warehouse_locations", "warehouses", "kyb_applications",
  "account_status_history", "organization_members", "organizations",
] as const;
type RowKey = Record<string, string | number>;
export class FixtureManifest {
  readonly testRunId = randomUUID();
  readonly rows = new Map<string, Map<string, RowKey>>();
  readonly storagePaths = new Set<string>();
  readonly orderIds = new Set<string>();
  readonly requestIds = new Set<string>();
  readonly buyerOrganizationId = randomUUID();
  readonly destinationId = randomUUID();
  readonly sellers: Array<{ organizationId: string; warehouseId: string; coffeeId: string; lotId: string; positionId: string; offerId: string }> = [];
  buyerClient?: SupabaseClient;
  record(table: string, key: RowKey): void {
    if (!OWNED_TABLES.includes(table as typeof OWNED_TABLES[number])) throw new Error("f016_manifest_table_refused");
    const rows = this.rows.get(table) ?? new Map<string, RowKey>();
    rows.set(JSON.stringify(key), key); this.rows.set(table, rows);
  }
  allocate(table: string): string { const value = randomUUID(); this.record(table, { id: value }); return value; }
  request(value: string = randomUUID()): string { id(value); this.requestIds.add(value); this.record("commerce_request_log", { request_id: value }); return value; }
  order(): string { const value = this.allocate("orders"); this.orderIds.add(value); return value; }
}
export interface LiveFixture {
  manifest: FixtureManifest; buyer: SupabaseClient; buyerOrganizationId: string;
  orderId: string; paymentId: string; reservationId: string; proofId: string; objectPath: string; quantity: number;
}
export const actorSql = (email: string) =>
  "select set_config('request.jwt.claim.sub',(select id::text from auth.users where email=" + sql(email) + "),true); select set_config('request.jwt.claim.role','authenticated',true);";

/** Capture exact PKs through actual FKs into preallocated run roots, including composite PKs.
 * Only keys leave the backend; financial/bank snapshots are never printed or returned. */
export async function captureOwnedRows(session: LiveSession, manifest: FixtureManifest): Promise<void> {
  await session.query("create temporary table if not exists f016_owned(table_name text,key jsonb,row_data jsonb,primary key(table_name,key)); truncate f016_owned;");
  for (const [table, rows] of manifest.rows) for (const key of rows.values()) {
    await session.query("insert into f016_owned select " + sql(table) + "," + sql(JSON.stringify(key)) + "::jsonb,to_jsonb(t) from public." + table + " t where to_jsonb(t) @> " + sql(JSON.stringify(key)) + "::jsonb on conflict do nothing;");
  }
  await session.query("do $capture$ declare r record; v_join text; v_key text; v_added int; v_total int; begin loop v_total:=0; " +
    "for r in select c.*,ch.relname child_table,pa.relname parent_table from pg_constraint c join pg_class ch on ch.oid=c.conrelid join pg_class pa on pa.oid=c.confrelid where c.contype='f' and ch.relnamespace='public'::regnamespace and pa.relnamespace='public'::regnamespace and ch.relname in (" + OWNED_TABLES.map(sql).join(",") + ") and pa.relname in (" + OWNED_TABLES.map(sql).join(",") + ") loop " +
    "select string_agg(format('to_jsonb(c)->%L = p.row_data->%L',ca.attname,pa.attname),' and ' order by k.ord) into v_join from unnest(r.conkey,r.confkey) with ordinality k(cn,pn,ord) join pg_attribute ca on ca.attrelid=r.conrelid and ca.attnum=k.cn join pg_attribute pa on pa.attrelid=r.confrelid and pa.attnum=k.pn; " +
    "select string_agg(format('%L,to_jsonb(c)->%L',a.attname,a.attname),',' order by k.ord) into v_key from pg_constraint pk join unnest(pk.conkey) with ordinality k(n,ord) on true join pg_attribute a on a.attrelid=pk.conrelid and a.attnum=k.n where pk.conrelid=r.conrelid and pk.contype='p'; " +
    "if v_key is null then raise exception 'f016_missing_primary_key'; end if; " +
    "execute format('insert into f016_owned select %L,jsonb_build_object(%s),to_jsonb(c) from public.%I c join f016_owned p on p.table_name=%L and %s on conflict do nothing',r.child_table,v_key,r.child_table,r.parent_table,v_join); get diagnostics v_added=row_count; v_total:=v_total+v_added; end loop; exit when v_total=0; end loop; " +
    "insert into f016_owned select 'audit_logs',jsonb_build_object('id',a.id),to_jsonb(a) from public.audit_logs a where a.entity_id::text in (select row_data->>'id' from f016_owned) on conflict do nothing; " +
    "insert into f016_owned select 'notifications',jsonb_build_object('id',n.id),to_jsonb(n) from public.notifications n where n.entity_id::text in (select row_data->>'id' from f016_owned) on conflict do nothing; " +
    "insert into f016_owned select 'notification_events',jsonb_build_object('id',n.id),to_jsonb(n) from public.notification_events n where n.aggregate_id::text in (select row_data->>'id' from f016_owned) on conflict do nothing; end $capture$;");
  for (const [table, key] of await session.query("select table_name,key::text from f016_owned;")) manifest.record(table!, JSON.parse(key!) as RowKey);
}

/** Session-local scaffold from actual Feature 015 SQL, retaining quote and snapshot guards.
 * Only enrollment is omitted: neither the public RPC nor commerce_settings is modified. */
export function fixtureCheckoutDefinition(): string {
  const source = readFileSync(resolve(process.cwd(), "supabase/migrations/20260930100000_feature_015_atomic_checkout_and_payment_proof.sql"), "utf8");
  const start = source.indexOf("create or replace function public.checkout_bank_transfer_v1(");
  const end = source.indexOf("revoke all on function public.checkout_bank_transfer_v1", start);
  if (start < 0 || end < start) throw new Error("f016_checkout_scaffold_missing");
  const definition = source.slice(start, end).replace("public.checkout_bank_transfer_v1(", "pg_temp.f016_fixture_checkout(");
  const gate = /if not found or not v_settings\.bank_transfer_checkout_enabled[\s\S]*?raise exception 'checkout_disabled';\s*end if;/;
  if (!gate.test(definition)) throw new Error("f016_checkout_scaffold_gate_drift");
  return definition.replace(gate, "if not found then raise exception 'f016_commerce_settings_missing'; end if;");
}
async function seedOwnedGraph(m: FixtureManifest, groups: number): Promise<void> {
  m.record("organizations", { id: m.buyerOrganizationId }); m.record("delivery_destinations", { id: m.destinationId });
  const kyb = m.allocate("kyb_applications");
  for (let i=0;i<groups;i++) m.sellers.push({ organizationId:m.allocate("organizations"),warehouseId:m.allocate("warehouses"),coffeeId:m.allocate("coffees"),lotId:m.allocate("coffee_lots"),positionId:m.allocate("inventory_positions"),offerId:m.allocate("coffee_offers") });
  const buyer = "(select id from auth.users where email=" + sql(BUYER_EMAIL) + ")";
  const warehouse = "(select id from auth.users where email=" + sql(WAREHOUSE_EMAIL) + ")";
  await withLiveSession(async s => {
    await s.query("begin;");
    await s.query("insert into public.organizations(id,legal_name,account_type,status,is_hills_internal,can_buy,can_sell) values(" + sql(m.buyerOrganizationId) + "," + sql("f016-"+m.testRunId+"-buyer") + ",'BUYER','ACTIVE',false,true,false); " +
      "insert into public.kyb_applications(id,organization_id,submitted_by,status,submitted_at,decided_at) values("+sql(kyb)+","+sql(m.buyerOrganizationId)+","+buyer+",'APPROVED',now(),now()); " +
      "insert into public.organization_members(organization_id,user_id,member_role,is_active) values("+sql(m.buyerOrganizationId)+","+buyer+",'OWNER',true); " +
      "insert into public.delivery_destinations(id,organization_id,label,country_code,city,address_line_1,contact_name,contact_phone,delivery_method,created_by) values("+sql(m.destinationId)+","+sql(m.buyerOrganizationId)+",'F016','AE','Dubai','F016 isolated address','F016 buyer','+97140000000','Courier',"+buyer+");");
    for (const x of m.sellers) await s.query(
      "insert into public.organizations(id,legal_name,account_type,status,is_hills_internal,can_buy,can_sell) values("+sql(x.organizationId)+","+sql("f016-"+m.testRunId+"-"+x.organizationId)+",'HILLS_INTERNAL','ACTIVE',true,true,true); "+
      "insert into public.organization_members(organization_id,user_id,member_role,is_active) values("+sql(x.organizationId)+","+warehouse+",'OWNER',true); "+
      "insert into public.warehouses(id,owner_organization_id,code,name,country_code,city,is_active) values("+sql(x.warehouseId)+","+sql(x.organizationId)+","+sql("f016-"+x.warehouseId)+",'F016 warehouse','AE','Dubai',true); "+
      "insert into public.coffees(id,name,slug,status) values("+sql(x.coffeeId)+",'F016 coffee',"+sql("f016-"+x.coffeeId)+",'DRAFT'); "+
      "insert into public.coffee_lots(id,coffee_id,lot_code,total_quantity_kg,status,source_organization_id) values("+sql(x.lotId)+","+sql(x.coffeeId)+","+sql("f016-"+x.lotId)+",100,'AVAILABLE',"+sql(x.organizationId)+"); "+
      "insert into public.inventory_positions(id,lot_id,owner_organization_id,warehouse_id,warehouse_location_id,available_quantity_kg,reserved_quantity_kg) values("+sql(x.positionId)+","+sql(x.lotId)+","+sql(x.organizationId)+","+sql(x.warehouseId)+",null,100,0); "+
      "insert into public.coffee_offers(id,coffee_id,lot_id,seller_organization_id,seller_type,warehouse_id,warehouse_location_id,quantity_kg,price_per_kg,status,is_visible,created_by) values("+sql(x.offerId)+","+sql(x.coffeeId)+","+sql(x.lotId)+","+sql(x.organizationId)+",'HILLS',"+sql(x.warehouseId)+",null,100,5,'PUBLISHED',true,"+buyer+");");
    await captureOwnedRows(s,m); await s.query("commit;");
  });
}
async function createOrder(m: FixtureManifest): Promise<LiveFixture> {
  const orderId=m.order(); const cartRequests=m.sellers.map(()=>m.request()); const checkoutRequest=m.request();
  let paymentId="",reservationId="",total=0;
  await withLiveSession(async s=>{
    await s.query("begin;"); await s.query(actorSql(BUYER_EMAIL));
    await s.query("insert into public.orders(id,buyer_organization_id,created_by,status,commerce_flow) values("+sql(orderId)+","+sql(m.buyerOrganizationId)+",auth.uid(),'DRAFT','BANK_TRANSFER_V1');");
    for(const [i,x] of m.sellers.entries()){
      const rows=await s.query("select public.add_cart_line("+sql(m.buyerOrganizationId)+"::uuid,"+sql(x.offerId)+"::uuid,1,"+sql(cartRequests[i])+"::uuid)::text;");
      if(JSON.parse(rows[0][0]!).order_id!==orderId) throw new Error("f016_cart_isolation_failed");
    }
    await s.query("create temporary table f016_session_anchor(id int) on commit drop;");
    await s.query(fixtureCheckoutDefinition());
    const rows=await s.query("select pg_temp.f016_fixture_checkout("+sql(orderId)+"::uuid,"+sql(m.destinationId)+"::uuid,"+sql(checkoutRequest)+"::uuid)::text;");
    const c=JSON.parse(rows[0][0]!); paymentId=id(c.payment_id); reservationId=id(c.reservation_id); total=Number(c.buyer_total);
    await captureOwnedRows(s,m); await s.query("commit;");
  });
  const prepareRequest=m.request(); let intentId="",objectPath="";
  await withLiveSession(async s=>{
    await s.query("begin;"); await s.query(actorSql(BUYER_EMAIL));
    const rows=await s.query("select public.prepare_payment_proof_upload("+sql(orderId)+"::uuid,"+sql(prepareRequest)+"::uuid,'f016-proof.pdf')::text;");
    const p=JSON.parse(rows[0][0]!); intentId=id(p.intent_id); objectPath=p.object_path; m.storagePaths.add(objectPath);
    await captureOwnedRows(s,m); await s.query("commit;");
  });
  const upload=await m.buyerClient!.storage.from("payment-proofs").upload(objectPath,Buffer.from("%PDF-1.4 F016 isolated fixture"),{contentType:"application/pdf",upsert:false});
  if(upload.error) throw new Error("f016_storage_upload_failed");
  const finalizeRequest=m.request(); let proofId="";
  await withLiveSession(async s=>{
    await s.query("begin;"); await s.query(actorSql(BUYER_EMAIL));
    const rows=await s.query("select public.finalize_payment_proof("+sql(orderId)+"::uuid,"+sql(intentId)+"::uuid,"+total+",current_date,'F016','F016 isolated fixture',"+sql(finalizeRequest)+"::uuid)::text;");
    proofId=id(JSON.parse(rows[0][0]!).data.proof_id); await captureOwnedRows(s,m); await s.query("commit;");
  });
  return {manifest:m,buyer:m.buyerClient!,buyerOrganizationId:m.buyerOrganizationId,orderId,paymentId,reservationId,proofId,objectPath,quantity:m.sellers.length};
}
export async function removeOwnedStorage(m:FixtureManifest):Promise<void>{
  if(!m.storagePaths.size)return;
  for (const path of m.storagePaths) {
    const parts = path.split("/");
    if (parts.length !== 6 || parts[0] !== "org" || parts[1] !== m.buyerOrganizationId || parts[2] !== "orders" || !m.orderIds.has(parts[3]) || parts[5] !== "proof") throw new Error("f016_storage_scope_refused");
    id(parts[4]);
  }
  const target=assertF016LiveTarget(); const token=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!token)throw new Error("f016_storage_cleanup_credential_missing");
  const origin="https://"+target.ref+".supabase.co/storage/v1";
  const headers={Authorization:"Bearer "+token,apikey:token,"Content-Type":"application/json"};
  const removed=await fetch(origin+"/object/payment-proofs",{method:"DELETE",headers,body:JSON.stringify({prefixes:[...m.storagePaths]}),signal:AbortSignal.timeout(30000)});
  if(!removed.ok)throw new Error("f016_storage_delete_failed");
  for(const path of m.storagePaths){
    const probe=await fetch(origin+"/object/info/payment-proofs/"+path.split("/").map(encodeURIComponent).join("/"),{headers,signal:AbortSignal.timeout(30000)});
    if(probe.status===404)continue;
    if(!probe.ok){const body=await probe.json() as {statusCode?:string|number;error?:string};if(String(body.statusCode)==="404"&&body.error==="not_found")continue;}
    throw new Error("f016_storage_object_absence_not_verified");
  }
}
/** Immutable tables have no deletion seam. Exclusive locks hide transactional guard suspension
 * from other sessions. FK triggers remain active; all original modes are restored before commit. */
export async function withOwnedMutation<T>(m:FixtureManifest,fn:(s:LiveSession)=>Promise<T>):Promise<T>{
  return withLiveSession(async s=>{
    await s.query("begin; set local lock_timeout='10s'; set local jit=off;");
    await s.query("lock table "+[...OWNED_TABLES].sort().map(t=>"public."+t).join(",")+" in access exclusive mode;");
    await captureOwnedRows(s,m);
    await s.query("do $$ begin if exists(select 1 from public.organizations where id="+sql(m.buyerOrganizationId)+" and legal_name<>"+sql("f016-"+m.testRunId+"-buyer")+") then raise exception 'f016_cleanup_scope_refused'; end if; end $$;");
    for (const orderId of m.orderIds) await s.query("do $$ begin if exists(select 1 from public.orders where id="+sql(orderId)+" and buyer_organization_id<>"+sql(m.buyerOrganizationId)+") then raise exception 'f016_cleanup_scope_refused'; end if; end $$;");
    for (const seller of m.sellers) await s.query("do $$ begin if exists(select 1 from public.organizations where id="+sql(seller.organizationId)+" and legal_name<>"+sql("f016-"+m.testRunId+"-"+seller.organizationId)+") then raise exception 'f016_cleanup_scope_refused'; end if; end $$;");
    // Refuse unknown inbound dependencies, including CASCADE; never let a parent delete them implicitly.
    await s.query("do $$ declare r record; v_join text; v_unowned boolean; begin for r in " +
      "select c.*,ch.relname child_table,pa.relname parent_table from pg_constraint c join pg_class ch on ch.oid=c.conrelid join pg_class pa on pa.oid=c.confrelid where c.contype='f' and ch.relnamespace='public'::regnamespace and pa.relnamespace='public'::regnamespace loop " +
      "select string_agg(format('to_jsonb(c)->%L = p.row_data->%L',ca.attname,pa.attname),' and ' order by k.ord) into v_join from unnest(r.conkey,r.confkey) with ordinality k(cn,pn,ord) join pg_attribute ca on ca.attrelid=r.conrelid and ca.attnum=k.cn join pg_attribute pa on pa.attrelid=r.confrelid and pa.attnum=k.pn; " +
      "execute format('select exists(select 1 from public.%I c join f016_owned p on p.table_name=%L and %s where not exists(select 1 from f016_owned own where own.table_name=%L and to_jsonb(c) @> own.key))',r.child_table,r.parent_table,v_join,r.child_table) into v_unowned; " +
      "if v_unowned then raise exception 'f016_unowned_inbound_dependency'; end if; end loop; end $$;");
    await s.query("create temporary table f016_trigger_modes on commit drop as select t.tgrelid,t.tgname,t.tgenabled from pg_trigger t where not t.tgisinternal and t.tgrelid in ("+OWNED_TABLES.map(t=>sql("public."+t)+"::regclass").join(",")+") and ((t.tgtype & 8)<>0 or (t.tgrelid='public.orders'::regclass and (t.tgtype & 16)<>0)) and t.tgenabled<>'D'; "+
      "do $$ declare r record; begin for r in select * from f016_trigger_modes loop execute format('alter table %s disable trigger %I',r.tgrelid::regclass,r.tgname); end loop; end $$;");
    const result=await fn(s);
    await s.query("do $$ declare r record; begin for r in select * from f016_trigger_modes loop execute format('alter table %s %s trigger %I',r.tgrelid::regclass,case r.tgenabled when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end,r.tgname); end loop; "+
      "if exists(select 1 from f016_trigger_modes m join pg_trigger t on t.tgrelid=m.tgrelid and t.tgname=m.tgname where t.tgenabled<>m.tgenabled) then raise exception 'f016_guard_restore_failed'; end if; end $$; commit;");
    return result;
  });
}
export async function cleanupLiveFixture(m:FixtureManifest):Promise<void>{
  await withLiveSession(async s=>{
    await captureOwnedRows(s,m);
    for(const [path] of await s.query("select row_data->>'object_path' from f016_owned where table_name='payment_proof_upload_intents';"))if(path)m.storagePaths.add(path);
  });
  await removeOwnedStorage(m);
  await withOwnedMutation(m,async s=>{
    for(const requestId of m.requestIds) await s.query("delete from public.commerce_request_log where request_id="+sql(requestId)+"::uuid;");
    for(const orderId of m.orderIds)await s.query("update public.orders set current_proforma_id=null where id="+sql(orderId)+";");
    await s.query("create temporary table f016_delete_order on commit drop as select distinct table_name from f016_owned; "+
      "create temporary table f016_delete_edges(child_table text,parent_table text) on commit drop; create temporary table f016_delete_sequence(seq serial,table_name text) on commit drop; "+
      "do $cleanup$ declare r record; k record; v_join text; v_progress boolean; begin "+
      "for r in select c.*,ch.relname child_table,pa.relname parent_table from pg_constraint c join pg_class ch on ch.oid=c.conrelid join pg_class pa on pa.oid=c.confrelid where c.contype='f' and ch.relnamespace='public'::regnamespace and pa.relnamespace='public'::regnamespace and ch.relname<>pa.relname and ch.relname in (select table_name from f016_delete_order) and pa.relname in (select table_name from f016_delete_order) and c.conname<>'orders_current_proforma_fkey' loop "+
      "select string_agg(format('c.row_data->%L = p.row_data->%L',ca.attname,pa.attname),' and ' order by u.ord) into v_join from unnest(r.conkey,r.confkey) with ordinality u(cn,pn,ord) join pg_attribute ca on ca.attrelid=r.conrelid and ca.attnum=u.cn join pg_attribute pa on pa.attrelid=r.confrelid and pa.attnum=u.pn; "+
      "execute format('insert into f016_delete_edges select distinct %L,%L from f016_owned c join f016_owned p on %s where c.table_name=%L and p.table_name=%L',r.child_table,r.parent_table,v_join,r.child_table,r.parent_table); end loop; "+
      "while exists(select 1 from f016_delete_order) loop v_progress:=false; "+
      "for r in select d.table_name from f016_delete_order d where not exists(select 1 from f016_delete_edges e join f016_delete_order pending on pending.table_name=e.child_table where e.parent_table=d.table_name) order by d.table_name loop "+
      "insert into f016_delete_sequence(table_name) values(r.table_name); delete from f016_delete_order where table_name=r.table_name; v_progress:=true; end loop; if not v_progress then raise exception 'f016_cleanup_fk_cycle'; end if; end loop; end $cleanup$;");
    // Keep the cleanup transaction atomic, but give each bounded table deletion its own SQL timeout.
    for (const [table] of await s.query("select table_name from f016_delete_sequence order by seq;")) {
      if (!OWNED_TABLES.includes(table as typeof OWNED_TABLES[number])) throw new Error("f016_manifest_table_refused");
      await s.query("do $$ declare k record; begin for k in select key from f016_owned where table_name="+sql(table!)+" loop execute format('delete from public.%I t where to_jsonb(t) @> $1',"+sql(table!)+") using k.key; end loop; end $$;");
    }
    for(const path of m.storagePaths)await s.query("do $$ begin if exists(select 1 from storage.objects where bucket_id='payment-proofs' and name="+sql(path)+") then raise exception 'f016_storage_metadata_leak'; end if; end $$;");
  });
  await assertManifestAbsent(m);
}
export async function assertManifestAbsent(m:FixtureManifest):Promise<void>{
  await withLiveSession(async s=>{
    for(const [table,rows] of m.rows) for(const key of rows.values()) {
      const result=await s.query("select exists(select 1 from public."+table+" t where to_jsonb(t) @> "+sql(JSON.stringify(key))+"::jsonb);");
      if(result[0][0]!=="f")throw new Error("f016_manifest_row_leak");
    }
    for(const requestId of m.requestIds){
      const result=await s.query("select count(*) from public.commerce_request_log where request_id="+sql(requestId)+"::uuid;");
      if(result[0][0]!=="0")throw new Error("f016_request_log_leak");
    }
    for(const path of m.storagePaths){
      const result=await s.query("select exists(select 1 from storage.objects where bucket_id='payment-proofs' and name="+sql(path)+");");
      if(result[0][0]!=="f")throw new Error("f016_storage_metadata_leak");
    }
  });
}
export async function withFixtureFamily<T>(orders:number,groups:number,fn:(fixtures:LiveFixture[])=>Promise<T>):Promise<T>{
  const m=new FixtureManifest();
  try{
    assertF016LiveTarget();
    if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("f016_storage_cleanup_credential_missing");
    m.buyerClient=await signInAsFixture(BUYER_EMAIL);
    await seedOwnedGraph(m,groups);
    const fixtures:LiveFixture[]=[];for(let i=0;i<orders;i++)fixtures.push(await createOrder(m));
    return await fn(fixtures);
  }finally{if(m.rows.size)await cleanupLiveFixture(m);}
}
export async function withLiveFixture(fn:(f:LiveFixture)=>Promise<void>,groups=1):Promise<void>{
  await withFixtureFamily(1,groups,async([f])=>fn(f));
}

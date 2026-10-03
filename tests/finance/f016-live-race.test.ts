import { beforeEach, describe, expect, it, vi } from "vitest";
import { concurrent } from "./f016-live-scenarios";
import { FixtureManifest, type LiveFixture, withLiveFixture } from "./f016-live-fixtures";
import { LiveDatabaseError, openLiveSession, withLiveSession, type LiveSession, type QueryRows } from "./f016-live-session";

vi.mock("./f016-live-session",async original=>({...await original<typeof import("./f016-live-session")>(),openLiveSession:vi.fn(),withLiveSession:vi.fn()}));
vi.mock("./f016-live-fixtures",async original=>({...await original<typeof import("./f016-live-fixtures")>(),withLiveFixture:vi.fn(),runSql:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
function setup(decisions:readonly ["CONFIRMED"|"REJECTED","CONFIRMED"|"REJECTED"],failure?:string){
  const manifest=new FixtureManifest();
  const seller={organizationId:manifest.allocate("organizations"),warehouseId:manifest.allocate("warehouses"),coffeeId:manifest.allocate("coffees"),lotId:manifest.allocate("coffee_lots"),positionId:manifest.allocate("inventory_positions"),offerId:manifest.allocate("coffee_offers")};
  manifest.sellers.push(seller);
  const f={manifest,orderId:manifest.order(),paymentId:manifest.allocate("payments"),reservationId:manifest.allocate("inventory_reservations"),proofId:manifest.allocate("payment_proofs"),buyerOrganizationId:manifest.buyerOrganizationId,quantity:1} as LiveFixture;
  vi.mocked(withLiveFixture).mockImplementation(async fn=>fn(f));
  let released=false,barrier=false;
  const pending:Array<{resolve:(rows:QueryRows)=>void;reject:(error:Error)=>void}>=[];
  const history:string[]=[];
  const sessions:LiveSession[]=[101,102,103].map(pid=>({pid,close:vi.fn(),query:vi.fn(async(statement:string):Promise<QueryRows>=>{
    history.push(`${pid}:${statement}`);
    if(statement==="select pg_backend_pid(),'ready';")return [[String(pid),"ready"]];
    if(statement.startsWith("select public.finance_review")){
      const key=statement.match(/'([a-f0-9-]+)'::uuid\)::text/)![1];
      expect(manifest.requestIds.has(key)).toBe(true);
      expect(released).toBe(false);
      return new Promise((resolve,reject)=>pending.push({resolve,reject}));
    }
    if(statement.includes("pg_stat_activity")){
      expect(pending).toHaveLength(2);expect(statement).toContain("101,102");
      if(failure==="overlap")throw new Error("f016_barrier_overlap_ack_timeout");
      barrier=true;
    }
    if(pid===103 && statement==="commit;"){
      expect(barrier).toBe(true);released=true;
      const payload={orderId:f.orderId,order_id:f.orderId,orderCode:"F016",order_code:"F016",paymentId:f.paymentId,payment_id:f.paymentId,decision:decisions[0],orderStatus:decisions[0]==="CONFIRMED"?"PAID":"PAYMENT_REJECTED",order_status:decisions[0]==="CONFIRMED"?"PAID":"PAYMENT_REJECTED",paymentStatus:decisions[0],payment_status:decisions[0],reservationStatus:decisions[0]==="CONFIRMED"?"CONSUMED":"RELEASED",reservation_status:decisions[0]==="CONFIRMED"?"CONSUMED":"RELEASED",taxInvoiceNumber:"T-1",tax_invoice_number:"T-1",shipmentIds:["shipment"],shipment_ids:["shipment"]};
      const result={...payload,requestId:[...manifest.requestIds][0],request_id:[...manifest.requestIds][0]};
      pending[0].resolve([[JSON.stringify(result)]]);
      if(failure==="arbitrary")pending[1].reject(new LiveDatabaseError("forbidden","P0001"));
      else if(decisions[0]!==decisions[1])pending[1].reject(new LiveDatabaseError("order_already_finalized","P0001"));
      else pending[1].resolve([[JSON.stringify(result)]]);
    }
    return [];
  })}));
  for(const session of sessions)vi.mocked(openLiveSession).mockResolvedValueOnce(session);
  vi.mocked(withLiveSession).mockImplementation(async fn=>fn({pid:104,close:vi.fn(),query:async()=>{
    const confirmed=released&&decisions[0]==="CONFIRMED";
    const positions:Array<Record<string,unknown>>=[{id:seller.positionId,lot_id:seller.lotId,owner_organization_id:seller.organizationId,available_quantity_kg:confirmed?99:100,reserved_quantity_kg:released?0:1}];
    if(confirmed)positions.push({id:"buyer-position",lot_id:seller.lotId,owner_organization_id:f.buyerOrganizationId,available_quantity_kg:1});
    return [[JSON.stringify({positions,offers:[{id:seller.offerId,quantity_kg:100,reserved_quantity_kg:released?0:1,filled_quantity_kg:confirmed?1:0}]})]];
  }}));
  return {sessions,history,manifest};
}
describe("F016 persistent session race orchestration",()=>{
  it.each([["CONFIRMED","CONFIRMED"],["REJECTED","REJECTED"],["CONFIRMED","REJECTED"],["REJECTED","CONFIRMED"]] as const)("checks overlap and exact outcome for %s/%s",async(a,b)=>{
    const {sessions,history,manifest}=setup([a,b]);
    await concurrent(a,b);
    expect(manifest.requestIds.size).toBe(2);
    expect(history.filter(s=>s.includes("'ready'"))).toHaveLength(2);
    expect(history.some(s=>s.includes("orders where")&&s.includes("for update"))).toBe(true);
    for(const session of sessions)expect(session.close).toHaveBeenCalledOnce();
  });
  it.each([["CONFIRMED","CONFIRMED"],["REJECTED","REJECTED"],["CONFIRMED","REJECTED"]] as const)("rejects an arbitrary worker failure for %s/%s",async(a,b)=>{
    setup([a,b],"arbitrary");
    await expect(concurrent(a,b)).rejects.toThrow(a===b?"f016_same_decision_race_failed":"f016_unexpected_error_raised");
  });
  it("does not release the barrier when overlap acknowledgement times out",async()=>{
    const {sessions,history}=setup(["CONFIRMED","CONFIRMED"],"overlap");
    await expect(concurrent("CONFIRMED","CONFIRMED")).rejects.toThrow("overlap_ack_timeout");
    expect(history).not.toContain("103:commit;");
    for(const session of sessions)expect(session.close).toHaveBeenCalledOnce();
  });
});

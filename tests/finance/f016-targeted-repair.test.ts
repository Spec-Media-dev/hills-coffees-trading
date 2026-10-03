import { describe, it, expect, vi, afterEach } from "vitest";
import { FixtureManifest, cleanupLiveFixture, type LiveFixture } from "./f016-live-fixtures";
import { financeCall, rollbackReapplyLifecycle, assertSnapshotEqual, assertStableResults } from "./f016-live-scenarios";
import { withLiveSession } from "./f016-live-session";

vi.mock("./f016-live-session", async importOriginal => ({
  ...await importOriginal<typeof import("./f016-live-session")>(), withLiveSession: vi.fn()
}));
afterEach(()=>vi.clearAllMocks());
describe("F016 targeted harness repairs",()=>{
  it("registers confirmed and replayed request IDs before invocation and removes exact log keys",async()=>{
    const manifest=new FixtureManifest();
    const fixture={manifest,orderId:manifest.order(),paymentId:manifest.allocate("payments")} as LiveFixture;
    const unrelated="16000000-0000-4000-8000-000000000099";
    const persisted=new Set<string>([unrelated]);
    const observed:string[]=[];
    const query=vi.fn(async(statement:string):Promise<Array<Array<string|null>>>=>{
      if(statement.startsWith("select public.finance_review")){
        const requestId=statement.match(/'([a-f0-9-]+)'::uuid\)::text/)![1];
        expect(manifest.requestIds.has(requestId)).toBe(true);
        expect([...manifest.rows.get("commerce_request_log")!.values()]).toContainEqual({request_id:requestId});
        persisted.add(requestId);observed.push(requestId);
        return [[JSON.stringify({decision:"CONFIRMED"})]];
      }
      if(statement.startsWith("delete from public.commerce_request_log where request_id=")){
        persisted.delete(statement.match(/request_id='([^']+)'/)![1]);
      }
      if(statement.startsWith("select count(*) from public.commerce_request_log"))return [[persisted.has(statement.match(/request_id='([^']+)'/)![1])?"1":"0"]];
      if(statement.startsWith("select exists("))return [["f"]];
      return [];
    });
    vi.mocked(withLiveSession).mockImplementation(async fn=>fn({pid:1,query,close:vi.fn()}));
    const key=manifest.request();
    await financeCall(fixture,"CONFIRMED",key);
    await financeCall(fixture,"CONFIRMED",key);
    await financeCall(fixture,"CONFIRMED");
    expect(observed).toEqual([key,key,observed[2]]);
    expect(manifest.requestIds.size).toBe(2);
    await cleanupLiveFixture(manifest);
    expect([...persisted]).toEqual([unrelated]);
    expect(query.mock.calls.filter(([s])=>s.startsWith("delete from public.commerce_request_log where request_id="))).toHaveLength(2);
  });
  it("detects identity, membership, quantity and counter changes even when counts match",()=>{
    const before={inventory:{available:99,reserved:0},items:[{id:"first",order_item_id:"item",planned_quantity_kg:1}],invoice:{id:"invoice",invoice_number:"T-1"}};
    expect(()=>assertSnapshotEqual(before,structuredClone(before))).not.toThrow();
    for(const after of [{...before,inventory:{available:100,reserved:0}},{...before,items:[{id:"replacement",order_item_id:"item",planned_quantity_kg:1}]},{...before,invoice:{id:"invoice",invoice_number:"T-2"}}])expect(()=>assertSnapshotEqual(before,after)).toThrow(/state_changed/);
    expect(()=>assertStableResults({decision:"CONFIRMED"},{decision:"CONFIRMED"})).toThrow(/field_missing/);
  });
  const sources={rollback:"rollback",forward:"forward",postflight:"postflight"};
  it.each(["rollback","baseline","forward","postflight","final"])("restores after a %s failure and preserves the original error",async stage=>{
    let applied=true,failed=false;
    const execute=vi.fn(async(sql:string)=>{
      if(sql==="rollback")applied=false;
      if(sql===stage&&!failed){failed=true;throw new Error("original");}
      if(sql==="forward")applied=true;
    });
    let inspection=0;
    const inspect=vi.fn(async(expected:boolean)=>{
      inspection++;
      if(((stage==="baseline" && !expected)||(stage==="final" && inspection===3))&&!failed){failed=true;throw new Error("original");}
      expect(applied).toBe(expected);
    });
    await expect(rollbackReapplyLifecycle(execute,async()=>applied,inspect,sources)).rejects.toThrow("original");
    expect(applied).toBe(true);
    expect(execute.mock.calls.at(-1)).toEqual(["postflight"]);
    expect(inspect.mock.calls.at(-1)).toEqual([true]);
    if(stage==="postflight"||stage==="final")expect(execute.mock.calls.filter(([sql])=>sql==="forward")).toHaveLength(1);
  });
  it("surfaces fatal recovery instructions if restoration fails",async()=>{
    const execute=vi.fn(async()=>{throw new Error("unavailable");});
    await expect(rollbackReapplyLifecycle(execute,async()=>false,async()=>{},sources)).rejects.toThrow(/F016_FATAL_RESTORATION_FAILED:.*operator.*postflight/);
  });
  it("does not mutate a target that fails initial applied-state inspection",async()=>{
    const execute=vi.fn();
    await expect(rollbackReapplyLifecycle(execute,async()=>false,async()=>{throw new Error("not applied");},sources)).rejects.toThrow("not applied");
    expect(execute).not.toHaveBeenCalled();
  });
});

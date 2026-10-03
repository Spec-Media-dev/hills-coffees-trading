import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveDatabaseError, openLiveSession } from "./f016-live-session";

const server = vi.hoisted(() => ({ raw: [] as Array<unknown>, sockets: [] as Array<unknown>, approved: true }));
const frame = (type: string, body: Buffer) => { const size=Buffer.alloc(4); size.writeInt32BE(body.length+4); return Buffer.concat([Buffer.from(type),size,body]); };
const int32 = (n:number) => {const b=Buffer.alloc(4);b.writeInt32BE(n);return b;};
class MockSocket extends EventEmitter {
  queries: string[]=[];
  destroy(){this.emit("close");return this;}
  write(bytes:Buffer){
    if(bytes[0]===81){
      const query=bytes.subarray(5,-1).toString();this.queries.push(query);
      if(query.endsWith("select pg_backend_pid();")){
        const count=Buffer.alloc(2);count.writeInt16BE(1);
        const value=Buffer.from(String(1000+server.sockets.indexOf(this)));
        this.send(Buffer.concat([frame("D",Buffer.concat([count,int32(value.length),value])),frame("Z",Buffer.from("I"))]));
      }
      return true;
    }
    const auth = bytes[0]===112;
    if(!auth)this.send(frame("R",Buffer.concat([int32(10),Buffer.from("SCRAM-SHA-256\0\0")])));
    else if(bytes.includes(Buffer.from("SCRAM-SHA-256")))this.send(frame("R",Buffer.concat([int32(11),Buffer.from("challenge")])));
    else this.send(Buffer.concat([
      frame("R",Buffer.concat([int32(12),Buffer.from("v="+Buffer.from("verified").toString("base64"))])),
      frame("R",int32(0)),frame("K",Buffer.concat([int32(100+server.sockets.indexOf(this)),int32(1)])),frame("Z",Buffer.from("I")),
    ]));
    return true;
  }
  send(data:Buffer){queueMicrotask(()=>{this.emit("data",data.subarray(0,3));this.emit("data",data.subarray(3));});}
}
vi.mock("node:net",()=>({default:{connect:()=>{const raw=new EventEmitter() as EventEmitter & {write:()=>void;destroy:()=>void};raw.write=()=>{};raw.destroy=()=>{};server.raw.push(raw);return raw;}}}));
vi.mock("node:tls",()=>({default:{connect:(_options:unknown,ready:()=>void)=>{const socket=new MockSocket();server.sockets.push(socket);queueMicrotask(ready);return socket;}}}));
vi.mock("@/scripts/f016-live-target",()=>({buildF016SanitizedEnv:()=>{if(!server.approved)throw new Error("gate_closed");return {PGHOST:"mock",PGPORT:"5432",PGUSER:"mock",SUPABASE_DB_PASSWORD:"not-a-secret"};}}));
vi.mock("@/scripts/pg-simple-exec.mjs",()=>({scramFinal:()=>({payload:"proof",signature:Buffer.from("verified")}),errorFields:()=>({M:"request_id_conflict",C:"P0001"})}));
async function connect(){
  const opened=openLiveSession();const raw=server.raw.at(-1) as EventEmitter;
  raw.emit("connect");raw.emit("data",Buffer.from("S"));return opened;
}
beforeEach(()=>{server.raw=[];server.sockets=[];server.approved=true;});
describe("F016 persistent session protocol (mock transport only)",()=>{
  it("fails the approval gate before creating a transport",async()=>{
    server.approved=false;await expect(openLiveSession()).rejects.toThrow("gate_closed");expect(server.raw).toHaveLength(0);
  });
  it("captures distinct backend PIDs after fragmented SCRAM frames",async()=>{
    const a=await connect(),b=await connect();expect(a.pid).toBe(1000);expect(b.pid).toBe(1001);a.close();b.close();
  });
  it("keeps a backend open across acknowledged transaction commands",async()=>{
    const s=await connect(),socket=server.sockets[0] as MockSocket;
    const begin=s.query("begin;");socket.send(frame("Z",Buffer.from("T")));await begin;
    const commit=s.query("commit;");socket.send(frame("Z",Buffer.from("I")));await commit;
    expect(socket.queries).toEqual(["set statement_timeout=30000; set lock_timeout=10000; select pg_backend_pid();","begin;","commit;"]);s.close();
  });
  it("returns typed database domain errors instead of exit-code ambiguity",async()=>{
    const s=await connect(),socket=server.sockets[0] as MockSocket;
    const query=s.query("select rejected_rpc();");
    const check=expect(query).rejects.toEqual(new LiveDatabaseError("request_id_conflict","P0001"));
    socket.send(Buffer.concat([frame("E",Buffer.from([0])),frame("Z",Buffer.from("E"))]));await check;s.close();
  });
  it("decodes fragmented persisted result rows and NULL values",async()=>{
    const s=await connect(),socket=server.sockets[0] as MockSocket;
    const query=s.query("select persisted_key,null;");
    const count=Buffer.alloc(2);count.writeInt16BE(2);
    const value=Buffer.from("owned-key");
    socket.send(Buffer.concat([frame("D",Buffer.concat([count,int32(value.length),value,int32(-1)])),frame("Z",Buffer.from("I"))]));
    expect(await query).toEqual([["owned-key",null]]);s.close();
  });
  it("refuses a second query while the same backend is blocked",async()=>{
    const s=await connect(),socket=server.sockets[0] as MockSocket;
    const first=s.query("select blocked_rpc();");
    await expect(s.query("select 2;")).rejects.toThrow("f016_session_not_ready");
    socket.send(frame("Z",Buffer.from("I")));await first;s.close();
  });
  it("settles pending barrier calls when cleanup closes a session",async()=>{
    const s=await connect(),pending=s.query("select blocked_rpc();");
    const check=expect(pending).rejects.toThrow("f016_session_closed");s.close();await check;
  });
});

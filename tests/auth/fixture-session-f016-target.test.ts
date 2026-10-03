import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { requireF013LocalTarget } from "@/scripts/f013-local-target";

const state=vi.hoisted(()=>({contents:""}));
vi.mock("@supabase/supabase-js",()=>({createClient:vi.fn(()=>({auth:{},storage:{}}))}));
vi.mock("@/scripts/f013-production-env.mjs",()=>({readProductionEnvLocal:()=>state.contents}));
vi.mock("@/scripts/f013-local-target",async original=>({
  ...await original<typeof import("@/scripts/f013-local-target")>(),
  requireF013LocalTarget:vi.fn(()=>({kind:"local",apiUrl:"http://127.0.0.1:55421",anonKey:"local-test-key",fixturePassword:"local-test-password"}))
}));
const approvedUrl="https://mxejnutukgxyccnohglo.supabase.co";
beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks();state.contents="";
  for(const name of ["F013_TARGET","F013_LOCAL_APPROVED","F013_LOCAL_BOOTSTRAP_APPROVED","F013_LOCAL_RESTORE_APPROVED","F013_DOCKER_PATH","F013_T071_LIVE","F013_TARGET_REF","F013_ISOLATED_TEST_APPROVED","F013_ISOLATED_ENV_FILE","F015_REMOTE_LIVE_DB_APPROVED","F013_LIVE"])vi.stubEnv(name,undefined);
  // All client creation and local-target probing are mocked; these tests cannot open a network connection.
  vi.stubEnv("F016_REMOTE_LIVE_DB_APPROVED","1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",approvedUrl);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","local-test-key");
});
afterEach(()=>vi.unstubAllEnvs());
const fixtureModule=()=>import("./fixture-session");
describe("F016 effective fixture HTTP target",()=>{
  it("creates a client only after the effective approved URL passes",async()=>{
    const {createAnonymousFixtureClient}=await fixtureModule();
    createAnonymousFixtureClient();
    expect(createClient).toHaveBeenCalledOnce();
    expect(vi.mocked(createClient).mock.calls[0][0]).toBe(approvedUrl);
    expect(requireF013LocalTarget).not.toHaveBeenCalled();
  });
  it.each([
    ["wrong project","https://other.supabase.co"],
    ["malformed","not a URL"],
    ["missing",undefined],
    ["localhost","http://localhost:55421"],
    ["loopback","http://127.0.0.1:55421"],
  ])("rejects %s before creating any Supabase client",async(_name,url)=>{
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",url);
    const {createAnonymousFixtureClient}=await fixtureModule();
    expect(()=>createAnonymousFixtureClient()).toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("validates the effective URL loaded from the environment file",async()=>{
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",undefined);
    state.contents="NEXT_PUBLIC_SUPABASE_URL=https://other.supabase.co";
    const {createAnonymousFixtureClient}=await fixtureModule();
    expect(()=>createAnonymousFixtureClient()).toThrow("f016_http_target_mismatch");
    expect(createClient).not.toHaveBeenCalled();
  });
  it("accepts an approved effective URL resolved from the environment file",async()=>{
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",undefined);
    state.contents="NEXT_PUBLIC_SUPABASE_URL="+approvedUrl;
    const {createAnonymousFixtureClient}=await fixtureModule();
    createAnonymousFixtureClient();
    expect(vi.mocked(createClient).mock.calls[0][0]).toBe(approvedUrl);
  });
  it("rejects mixed F013-local/F016-remote before local probing or client creation",async()=>{
    vi.stubEnv("F013_TARGET","local");vi.stubEnv("F013_LOCAL_APPROVED","1");
    const {createAnonymousFixtureClient,fixturePassword}=await fixtureModule();
    expect(()=>createAnonymousFixtureClient()).toThrow("f016_remote_refuses_f013_local_override");
    expect(()=>fixturePassword()).toThrow("f016_remote_refuses_f013_local_override");
    expect(requireF013LocalTarget).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
  it("preserves F013 local URL/key resolution outside F016 remote mode",async()=>{
    vi.stubEnv("F016_REMOTE_LIVE_DB_APPROVED",undefined);
    vi.stubEnv("F013_TARGET","local");vi.stubEnv("F013_LOCAL_APPROVED","1");
    const {createAnonymousFixtureClient}=await fixtureModule();
    createAnonymousFixtureClient();
    expect(requireF013LocalTarget).toHaveBeenCalledOnce();
    expect(vi.mocked(createClient).mock.calls[0].slice(0,2)).toEqual(["http://127.0.0.1:55421","local-test-key"]);
  });
  it("rejects a cached local override after switching to F016 remote mode",async()=>{
    vi.stubEnv("F016_REMOTE_LIVE_DB_APPROVED",undefined);
    vi.stubEnv("F013_TARGET","local");vi.stubEnv("F013_LOCAL_APPROVED","1");
    const {createAnonymousFixtureClient}=await fixtureModule();
    createAnonymousFixtureClient();vi.mocked(createClient).mockClear();
    vi.stubEnv("F013_TARGET",undefined);vi.stubEnv("F013_LOCAL_APPROVED",undefined);
    vi.stubEnv("F016_REMOTE_LIVE_DB_APPROVED","1");
    expect(()=>createAnonymousFixtureClient()).toThrow("f016_remote_refuses_f013_local_override");
    expect(createClient).not.toHaveBeenCalled();
  });
});

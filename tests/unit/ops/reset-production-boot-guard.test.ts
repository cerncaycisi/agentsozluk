import { afterEach, describe, expect, it, vi } from "vitest";
const { show, file } = vi.hoisted(() => ({ show: vi.fn(), file: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: show }));
vi.mock("node:fs", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  lstatSync: file,
  realpathSync: (path: string) => path,
  readFileSync: () => resetBootDropIn,
}));
import {
  assertResetBootstrapConfiguration,
  resetBootDropIn,
  resetBootDropInPath,
  resetGenerationCompose,
  assertResetAutomaticRebootDisabled,
} from "../../../scripts/reset-production-boot-guard";

afterEach(() => vi.resetAllMocks());
function configure(overrides: Record<string, string> = {}) {
  const properties = {
    FragmentPath: "/etc/systemd/system/agent-sozluk.service",
    NeedDaemonReload: "no",
    DropInPaths: resetBootDropInPath,
    ...overrides,
  };
  show.mockImplementation(
    (_binary: string, args: string[]) =>
      properties[args[2]!.slice("--property=".length) as keyof typeof properties],
  );
  file.mockReturnValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    uid: 0,
    mode: 0o100444,
  });
}
describe("reset sırasında bootstrap yeniden açılış sınırı", () => {
  it.each(["", "RESET_REBOOT='true'", "RESET_REBOOT='FALSE'", "RESET_REBOOT='false'; extra"])(
    "açık false dışındaki otomatik reboot ayarını reddeder: %s",
    (value) => {
      expect(() => assertResetAutomaticRebootDisabled(value)).toThrow(
        "GREAT_RESET_AUTOMATIC_REBOOT_NOT_DISABLED",
      );
      expect(() => assertResetAutomaticRebootDisabled("RESET_REBOOT='false'\n")).not.toThrow();
    },
  );

  it("shutdown'da base down komutunu silmeyen stop ile değiştirir", () => {
    const directives = resetBootDropIn.split("\n");
    const stops = directives.filter((line) => line.startsWith("ExecStop="));
    expect(stops).toHaveLength(2);
    expect(stops[0]).toBe("ExecStop=");
    expect(stops[1]).toContain("reset-generation-compose.yaml stop --timeout 60");
    expect(stops[1]).not.toMatch(/\bdown\b/u);
  });
  it("bakımda restart'ı kapatır; yalnız latch'li terminal durumda otomatik restart'ı geri verir", () => {
    for (const required of [true, false])
      expect(resetGenerationCompose(required)).toContain('restart: "no"');
    const terminal = resetGenerationCompose(true, true);
    expect(terminal).toContain('restart: "unless-stopped"');
    expect(terminal).toContain('AGENT_SOZLUK_RESET_GENERATION_REQUIRED: "true"');
    expect(terminal).toContain("read_only: true");
    expect(() => resetGenerationCompose(false, true)).toThrow(
      "GREAT_RESET_GENERATION_COMPOSE_INVALID",
    );
  });

  it("kurulum öncesinde ek override istemez; kurulum sonrasında yalnız root hold override yüklenir", () => {
    configure({ DropInPaths: "" });
    expect(() => assertResetBootstrapConfiguration(false)).not.toThrow();
    expect(() => assertResetBootstrapConfiguration(true)).toThrow();
    configure();
    expect(() => assertResetBootstrapConfiguration(true)).not.toThrow();
    expect(() => assertResetBootstrapConfiguration(false)).toThrow();
  });
  it.each([
    {
      DropInPaths: `${resetBootDropInPath} /etc/systemd/system/agent-sozluk.service.d/99-start.conf`,
    },
    { NeedDaemonReload: "yes" },
    { FragmentPath: "/run/systemd/system/agent-sozluk.service" },
  ])("override/reload drift'inde reseti durdurur: %j", (patch) => {
    configure(patch);
    expect(() => assertResetBootstrapConfiguration(true)).toThrow(
      "GREAT_RESET_BOOTSTRAP_CONFIGURATION_CHANGED",
    );
  });
  it("yüklenmiş dosya operatör kullanıcısına aitse onu root koruması saymaz", () => {
    configure();
    file.mockReturnValue({
      isFile: () => true,
      isSymbolicLink: () => false,
      uid: 1000,
      mode: 0o100444,
    });
    expect(() => assertResetBootstrapConfiguration(true)).toThrow();
  });
});

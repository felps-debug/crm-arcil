import { describe, expect, it } from "vitest";
import { VALID_ROLES } from "./roles";
import { labelRole, labelSegment, ROLE_LABELS_API, SEGMENT_LABELS_API } from "./crm-labels";

describe("rótulos em português", () => {
  it("todo papel válido tem rótulo, e nenhum é o código em inglês", () => {
    for (const role of VALID_ROLES) {
      expect(ROLE_LABELS_API[role], role).toBeTruthy();
      expect(labelRole(role)).not.toBe(role);
      expect(labelRole(role)).not.toMatch(/_/);
    }
  });

  it("papéis presos a segmento têm nome claro", () => {
    expect(labelRole("installer_manager")).toBe("Gestor de instaladores");
    expect(labelRole("builder_manager")).toBe("Gestor de construtores e arquitetos");
  });

  it("papel desconhecido ou vazio não quebra", () => {
    expect(labelRole("algo_novo")).toBe("algo_novo");
    expect(labelRole(null)).toBe("Sem papel");
    expect(labelRole("")).toBe("Sem papel");
  });

  it("todo segmento conhecido tem rótulo em português", () => {
    for (const seg of ["NEW", "CONSUMER", "BUILDER", "ARCHITECT", "INSTALLER", "RESELLER", "COBRANCA"]) {
      expect(SEGMENT_LABELS_API[seg], seg).toBeTruthy();
      expect(labelSegment(seg)).not.toBe(seg);
    }
    expect(labelSegment("INSTALLER")).toBe("Instalador");
    expect(labelSegment("BUILDER")).toBe("Construtor / Arquiteto");
  });
});

"use client";

import { useState } from "react";
import { ConsoleButton } from "@/components/console/console-shell";
import { ProdutoPicker } from "./produto-picker";
import { HINTS, type Step, type StepGroup } from "./step-groups";
import type { InventoryProduct } from "@/types/api";

/**
 * Campos de UM grupo de perguntas, todos visíveis na mesma tela. Cobre os 4
 * tipos que aparecem dentro de um grupo multi-campo (`text`, `choice`,
 * `medida`, `produto`) — `file` e `marcacao` nunca entram aqui, são sempre
 * grupos de 1 campo com tela própria (ver `step-groups.ts` e `page.tsx`).
 */
export function GroupForm({
  grupo,
  answers,
  onChangeAnswer,
  onConfirmProduto,
  disabled,
}: {
  grupo: StepGroup;
  answers: Record<string, string>;
  onChangeAnswer: (chave: string, valor: string) => void;
  onConfirmProduto: (produto: InventoryProduct, tipo: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      {grupo.steps.map((step) => (
        <div key={step.key}>
          <p className="mb-1.5 text-[12px] font-bold text-[var(--text-primary)]">{step.question}</p>
          {HINTS[step.key] && <p className="mb-2 text-[11px] text-[var(--text-muted)]">{HINTS[step.key]}</p>}
          <CampoStep step={step} valor={answers[step.key] ?? ""} onChange={(v) => onChangeAnswer(step.key, v)} onConfirmProduto={onConfirmProduto} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}

function CampoStep({
  step,
  valor,
  onChange,
  onConfirmProduto,
  disabled,
}: {
  step: Step;
  valor: string;
  onChange: (v: string) => void;
  onConfirmProduto: (produto: InventoryProduct, tipo: string) => void;
  disabled?: boolean;
}) {
  if (step.type === "text") {
    return (
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite sua resposta..."
        disabled={disabled}
        className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60"
      />
    );
  }

  if (step.type === "choice") {
    return (
      <div className="flex flex-wrap gap-2">
        {step.options.map((opt) => (
          <ConsoleButton key={opt} active={valor === opt} onClick={() => onChange(opt)} disabled={disabled} className="flex-1 justify-center">
            {opt}
          </ConsoleButton>
        ))}
      </div>
    );
  }

  if (step.type === "medida") {
    return <CampoMedida step={step} valor={valor} onChange={onChange} disabled={disabled} />;
  }

  if (step.type === "produto") {
    return <ProdutoPicker onConfirm={onConfirmProduto} disabled={disabled} />;
  }

  return null;
}

function CampoMedida({
  step,
  valor,
  onChange,
  disabled,
}: {
  step: Extract<Step, { type: "medida" }>;
  valor: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // O valor guardado já vem "60 cm" (número + unidade); a caixa de texto
  // mostra só o número, e a unidade é o botão selecionado ao lado.
  const [numeroInicial, unidadeInicial] = valor ? valor.split(" ") : ["", step.unidades[0]];
  const [numero, setNumero] = useState(numeroInicial);
  const [unidade, setUnidade] = useState<"m" | "cm">((unidadeInicial as "m" | "cm") || step.unidades[0]);

  const atualizar = (novoNumero: string, novaUnidade: "m" | "cm") => {
    const limpo = novoNumero.replace(/[^\d.,]/g, "");
    setNumero(limpo);
    onChange(limpo ? `${limpo} ${novaUnidade}` : "");
  };

  return (
    <div className="flex items-center gap-2">
      <input
        inputMode="decimal"
        value={numero}
        onChange={(e) => atualizar(e.target.value, unidade)}
        placeholder="0,00"
        disabled={disabled}
        className="w-24 rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60"
      />
      <div className="flex gap-1">
        {step.unidades.map((u) => (
          <button
            key={u}
            onClick={() => {
              setUnidade(u);
              if (numero) atualizar(numero, u);
            }}
            disabled={disabled}
            className={`rounded-[8px] border px-3 py-2.5 text-[12px] font-semibold transition ${
              unidade === u ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}

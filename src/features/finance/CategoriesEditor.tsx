import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArchiveRestore, ChevronRight, Plus } from "lucide-react";
import { toast } from "@/app/ui-store";
import { actions, nextOrder } from "@/data/store";
import type { FinancialCategory, ID, Tone } from "@/data/types";
import {
  Button,
  Field,
  MoneyInput,
  Pill,
  SectionTitle,
  TextInput,
  TONE,
  TONES,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBRLShort } from "@/lib/money";
import { CatBadge } from "./parts";

interface Draft {
  name: string;
  emoji: string;
  tone: Tone;
  budgetCents?: number;
}

const NEW = "__new__";

function Editor({
  initial,
  onSave,
  onCancel,
  onArchive,
  archived,
}: {
  initial: Draft;
  onSave: (d: Draft) => void;
  onCancel: () => void;
  onArchive?: () => void;
  archived?: boolean;
}) {
  const [d, setD] = useState<Draft>(initial);
  const ok = d.name.trim().length > 0;
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden"
    >
      <div className="px-4 pb-4 pt-1 space-y-3">
        <div className="flex gap-2">
          <Field label="Emoji" className="w-20">
            <TextInput
              value={d.emoji}
              maxLength={4}
              onChange={(e) => setD({ ...d, emoji: e.target.value })}
              className="text-center text-[20px]"
              aria-label="Emoji"
            />
          </Field>
          <Field label="Nome" className="flex-1">
            <TextInput
              value={d.name}
              autoFocus={!initial.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder="ex.: Farmácia"
            />
          </Field>
        </div>
        <div>
          <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">
            Cor
          </div>
          <div className="flex gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`cor ${t}`}
                aria-pressed={d.tone === t}
                onClick={() => setD({ ...d, tone: t })}
                className={cn(
                  "h-11 w-11 rounded-full flex items-center justify-center border-2 transition",
                  d.tone === t ? "border-ink" : "border-transparent",
                )}
              >
                <span className={cn("h-7 w-7 rounded-full", TONE[t].dot)} />
              </button>
            ))}
          </div>
        </div>
        <Field
          label="Orçamento do mês"
          hint="opcional — só pra ter noção, sem cobrança"
        >
          <MoneyInput
            valueCents={d.budgetCents}
            onChange={(v) => setD({ ...d, budgetCents: v })}
          />
        </Field>
        <div className="flex items-center gap-2 pt-1">
          {onArchive && (
            <Button
              variant="ghost"
              size="sm"
              icon={
                archived ? <ArchiveRestore size={16} /> : <Archive size={16} />
              }
              onClick={onArchive}
            >
              {archived ? "Reativar" : "Arquivar"}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!ok}
            onClick={() =>
              onSave({
                ...d,
                name: d.name.trim(),
                emoji: d.emoji.trim() || "•",
              })
            }
          >
            Salvar
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function CategoriesEditor({
  categories,
}: {
  categories: FinancialCategory[];
}) {
  const [editing, setEditing] = useState<ID | undefined>();
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const active = [...categories]
    .filter((c) => !c.archived)
    .sort((a, b) => a.order - b.order);
  const archived = categories.filter((c) => c.archived);
  const list = showArchived ? [...active, ...archived] : active;

  function save(c: FinancialCategory | undefined, d: Draft) {
    if (c)
      actions.update("financialCategories", c.id, {
        ...d,
        budgetCents: d.budgetCents || undefined,
      });
    else
      actions.create("financialCategories", {
        ...d,
        budgetCents: d.budgetCents || undefined,
        order: nextOrder(categories),
        archived: false,
      });
    toast(c ? "Categoria atualizada ✓" : "Categoria criada ✓");
    setEditing(undefined);
  }

  return (
    <>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              setEditing(NEW);
            }}
            className="inline-flex items-center gap-1 text-[13px] text-accent font-medium h-8 px-1"
          >
            <Plus size={15} /> nova
          </button>
        }
      >
        Categorias
      </SectionTitle>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="card w-full flex items-center gap-3 min-h-[60px] px-4 py-3 text-left active:scale-[0.99] transition"
        >
          <span className="flex -space-x-1.5 shrink-0" aria-hidden>
            {active.slice(0, 5).map((c) => (
              <span key={c.id} className="ring-2 ring-surface rounded-full">
                <CatBadge category={c} size="sm" />
              </span>
            ))}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px]">
              {active.length} categorias
            </span>
            <span className="block text-[12.5px] text-muted">
              nome, emoji, cor e orçamento
            </span>
          </span>
          <ChevronRight size={18} className="text-muted/60 shrink-0" />
        </button>
      ) : (
        <div className="card overflow-hidden divide-y divide-line/70">
          <AnimatePresence initial={false}>
            {editing === NEW && (
              <Editor
                key="new"
                initial={{ name: "", emoji: "✨", tone: "sand" }}
                onSave={(d) => save(undefined, d)}
                onCancel={() => setEditing(undefined)}
              />
            )}
          </AnimatePresence>
          {list.map((c) => {
            const open = editing === c.id;
            return (
              <div key={c.id} className={cn(c.archived && "opacity-60")}>
                <button
                  type="button"
                  onClick={() => setEditing(open ? undefined : c.id)}
                  className="w-full flex items-center gap-3 min-h-[52px] py-2 px-4 text-left active:bg-surface-2 transition-colors"
                >
                  <CatBadge category={c} size="sm" />
                  <span className="flex-1 min-w-0 text-[15px] truncate">
                    {c.name}
                  </span>
                  {c.archived && <Pill>arquivada</Pill>}
                  {c.budgetCents ? (
                    <Pill>{formatBRLShort(c.budgetCents)}/mês</Pill>
                  ) : null}
                  <ChevronRight
                    size={17}
                    className={cn(
                      "text-muted/60 transition-transform",
                      open && "rotate-90",
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <Editor
                      key={c.id}
                      initial={{
                        name: c.name,
                        emoji: c.emoji,
                        tone: c.tone,
                        budgetCents: c.budgetCents,
                      }}
                      archived={c.archived}
                      onSave={(d) => save(c, d)}
                      onCancel={() => setEditing(undefined)}
                      onArchive={() => {
                        actions.update("financialCategories", c.id, {
                          archived: !c.archived,
                        });
                        toast(
                          c.archived
                            ? "Categoria de volta ✓"
                            : "Arquivada — os gastos antigos continuam lá",
                        );
                        setEditing(undefined);
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {list.length === 0 && editing !== NEW && (
            <div className="px-4 py-5 text-[14px] text-muted">
              Nenhuma categoria ainda. Cria a primeira em “+ nova”.
            </div>
          )}
        </div>
      )}
      {expanded && archived.length > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-[13px] text-muted h-10 px-1"
        >
          {showArchived
            ? "esconder arquivadas"
            : `ver arquivadas (${archived.length})`}
        </button>
      )}
    </>
  );
}

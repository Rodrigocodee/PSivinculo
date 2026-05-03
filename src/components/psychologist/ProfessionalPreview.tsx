import {
  createContext,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PreviewUnlockPrompt = {
  title: string;
  description: string;
};

type ProfessionalPreviewContextValue = {
  isPreviewMode: boolean;
  ctaHref: string;
  requestUnlock: (prompt?: Partial<PreviewUnlockPrompt>) => boolean;
};

const PROFESSIONAL_PREVIEW_CTA_HREF = "/psi/planos";
const PREVIEW_ACTION_ATTRIBUTE = "data-preview-action";
const PREVIEW_TITLE_ATTRIBUTE = "data-preview-title";
const PREVIEW_DESCRIPTION_ATTRIBUTE = "data-preview-description";

const defaultUnlockPrompt: PreviewUnlockPrompt = {
  title: "Libere seu acesso para comecar a usar o Psivinculo de forma completa.",
  description:
    "Voce esta explorando o Psivinculo em modo preview. A interface e real para mostrar o valor do produto, mas as acoes que alteram dados ficam liberadas somente apos a assinatura ou liberacao do acesso.",
};

const previewHighlights = [
  "Explore a interface real do dashboard, agenda, pacientes e financeiro.",
  "Veja como a rotina profissional vai funcionar antes de contratar.",
  "Libere o acesso para cadastrar, agendar, salvar prontuarios e emitir recibos.",
];

const ProfessionalPreviewContext = createContext<ProfessionalPreviewContextValue>({
  isPreviewMode: false,
  ctaHref: PROFESSIONAL_PREVIEW_CTA_HREF,
  requestUnlock: () => false,
});

function getPromptFromElement(element: Element | null | undefined) {
  if (!element) return {};

  const title = element.getAttribute(PREVIEW_TITLE_ATTRIBUTE)?.trim() || undefined;
  const description = element.getAttribute(PREVIEW_DESCRIPTION_ATTRIBUTE)?.trim() || undefined;

  return {
    title,
    description,
  } satisfies Partial<PreviewUnlockPrompt>;
}

function getSubmitTrigger(target: Element) {
  const trigger = target.closest("button, input");

  if (trigger instanceof HTMLButtonElement) {
    return trigger.type === "submit" ? trigger : null;
  }

  if (trigger instanceof HTMLInputElement) {
    return trigger.type === "submit" ? trigger : null;
  }

  return null;
}

export function getProfessionalPreviewActionProps(prompt?: Partial<PreviewUnlockPrompt>) {
  return {
    [PREVIEW_ACTION_ATTRIBUTE]: "true",
    [PREVIEW_TITLE_ATTRIBUTE]: prompt?.title,
    [PREVIEW_DESCRIPTION_ATTRIBUTE]: prompt?.description,
  } as const;
}

export function PsychologistProfessionalPreviewProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [prompt, setPrompt] = useState<PreviewUnlockPrompt>(defaultUnlockPrompt);

  const contextValue = useMemo<ProfessionalPreviewContextValue>(
    () => ({
      isPreviewMode: enabled,
      ctaHref: PROFESSIONAL_PREVIEW_CTA_HREF,
      requestUnlock: (nextPrompt) => {
        if (!enabled) return false;

        setPrompt({
          title: nextPrompt?.title || defaultUnlockPrompt.title,
          description: nextPrompt?.description || defaultUnlockPrompt.description,
        });
        setIsDialogOpen(true);
        return true;
      },
    }),
    [enabled],
  );

  function openUnlockFromElement(element: Element | null | undefined) {
    contextValue.requestUnlock(getPromptFromElement(element));
  }

  function handleProtectedClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!enabled) return;
    if (!(event.target instanceof Element)) return;

    const protectedElement = event.target.closest(`[${PREVIEW_ACTION_ATTRIBUTE}="true"]`);
    if (!protectedElement) return;

    if (protectedElement instanceof HTMLFormElement) {
      const submitTrigger = getSubmitTrigger(event.target);
      if (!submitTrigger) return;

      event.preventDefault();
      event.stopPropagation();
      openUnlockFromElement(submitTrigger);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openUnlockFromElement(protectedElement);
  }

  function handleProtectedSubmitCapture(event: FormEvent<HTMLDivElement>) {
    if (!enabled) return;
    if (!(event.target instanceof HTMLFormElement)) return;

    event.preventDefault();
    event.stopPropagation();

    const nativeEvent = event.nativeEvent;
    const submitter =
      nativeEvent instanceof SubmitEvent && nativeEvent.submitter instanceof Element
        ? nativeEvent.submitter
        : null;

    openUnlockFromElement(submitter || event.target);
  }

  return (
    <ProfessionalPreviewContext.Provider value={contextValue}>
      <div onClickCapture={handleProtectedClickCapture} onSubmitCapture={handleProtectedSubmitCapture}>
        {children}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="overflow-hidden rounded-[1.75rem] border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,252,0.96))] p-0 shadow-[0_36px_90px_-38px_rgba(79,88,156,0.38)] sm:max-w-xl">
          <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.18),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,244,252,0.9))] px-6 py-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/72 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Preview profissional
            </div>

            <DialogHeader className="mt-4 space-y-3 text-left">
              <DialogTitle className="font-heading text-2xl font-bold tracking-[-0.03em] text-foreground">
                {prompt.title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                {prompt.description}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-5">
            <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <LockKeyhole className="h-4 w-4 text-primary" />
                O que voce libera ao ativar o acesso
              </div>
              <div className="space-y-2">
                {previewHighlights.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              O Psivinculo segue navegavel em modo preview para voce sentir a experiencia antes da liberacao completa.
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 px-6 py-4 sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Acesso completo so apos assinatura ou liberacao.
            </div>

            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Continuar explorando
              </Button>
              <Button asChild className="gradient-primary text-primary-foreground hover:opacity-90">
                <Link to={PROFESSIONAL_PREVIEW_CTA_HREF}>
                  Escolher plano
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProfessionalPreviewContext.Provider>
  );
}

export function ProfessionalPreviewBanner() {
  const { isPreviewMode } = usePsychologistProfessionalPreview();

  if (!isPreviewMode) return null;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-primary/15 bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(247,244,252,0.96))] px-5 py-5 shadow-[0_26px_70px_-46px_rgba(79,88,156,0.38)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Preview da area profissional
          </div>

          <h2 className="mt-3 font-heading text-2xl font-bold tracking-[-0.03em] text-foreground">
            Sua area ja esta pronta para exploracao, com bloqueio inteligente nas acoes principais.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Navegue pela experiencia real do Psivinculo, veja agenda, pacientes, prontuarios e financeiro, e libere o uso completo quando quiser contratar o plano.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            asChild
            variant="outline"
            className="border-primary/20 bg-white/80"
          >
            <Link to={PROFESSIONAL_PREVIEW_CTA_HREF}>
              <LockKeyhole className="h-4 w-4" />
              Liberar acesso
            </Link>
          </Button>
          <Button asChild className="gradient-primary text-primary-foreground hover:opacity-90">
            <Link to={PROFESSIONAL_PREVIEW_CTA_HREF}>
              Escolher plano
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function usePsychologistProfessionalPreview() {
  return useContext(ProfessionalPreviewContext);
}

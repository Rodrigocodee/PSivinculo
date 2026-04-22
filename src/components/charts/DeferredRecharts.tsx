import { useEffect, useRef, useState, type ReactNode } from "react";

type RechartsModule = typeof import("recharts");

type DeferredRechartsProps = {
  children: (recharts: RechartsModule) => ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
};

let rechartsModulePromise: Promise<RechartsModule> | null = null;

function loadRechartsModule() {
  if (!rechartsModulePromise) {
    rechartsModulePromise = import("recharts");
  }

  return rechartsModulePromise;
}

export function DeferredRecharts({
  children,
  fallback = (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl bg-muted/30 px-4 text-sm text-muted-foreground">
      Carregando grafico...
    </div>
  ),
  rootMargin = "240px",
}: DeferredRechartsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rechartsModule, setRechartsModule] = useState<RechartsModule | null>(null);

  useEffect(() => {
    if (rechartsModule) return;

    let cancelled = false;
    const container = containerRef.current;

    async function hydrateCharts() {
      try {
        const module = await loadRechartsModule();
        if (!cancelled) {
          setRechartsModule(module);
        }
      } catch (error) {
        console.error("[Psivinculo][deferred-recharts][load_error]", error);
      }
    }

    if (!container || typeof IntersectionObserver === "undefined") {
      hydrateCharts();

      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) return;

        observer.disconnect();
        hydrateCharts();
      },
      { rootMargin },
    );

    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [rechartsModule, rootMargin]);

  return <div ref={containerRef}>{rechartsModule ? children(rechartsModule) : fallback}</div>;
}

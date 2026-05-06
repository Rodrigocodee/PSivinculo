const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || "";
const GA_SCRIPT_ID = "psivinculo-ga4";

type GtagCommand = [
  command: "js",
  date: Date,
] | [
  command: "config",
  targetId: string,
  config?: Record<string, unknown>,
] | [
  command: "event",
  eventName: string,
  params?: Record<string, unknown>,
];

type PageViewParams = {
  page_path: string;
  page_location: string;
  page_title: string;
};

declare global {
  interface Window {
    dataLayer?: GtagCommand[];
    gtag?: (...args: GtagCommand) => void;
  }
}

let isInitialized = false;
let lastTrackedPath = "";
let canSendPageViewsImmediately = false;
let pendingPageViews: PageViewParams[] = [];

function canUseAnalytics() {
  return Boolean(GA_MEASUREMENT_ID) && typeof window !== "undefined" && typeof document !== "undefined";
}

function ensureGtag() {
  const hadExistingGtag = typeof window.gtag === "function";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: GtagCommand) {
    window.dataLayer?.push(args);
  };

  return hadExistingGtag;
}

function sendPageView(params: PageViewParams) {
  window.gtag?.("event", "page_view", params);
}

function flushPendingPageView() {
  if (!canSendPageViewsImmediately || pendingPageViews.length === 0) return;

  const pageViews = pendingPageViews;
  pendingPageViews = [];
  pageViews.forEach((params) => sendPageView(params));
}

function isLikelyIdentifier(segment: string) {
  const decodedSegment = (() => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();
  const digitsOnly = decodedSegment.replace(/\D/g, "");

  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decodedSegment) ||
    /^[A-Za-z0-9_-]{20,}$/.test(decodedSegment) ||
    /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(decodedSegment) ||
    digitsOnly.length === 11 ||
    /^crp[-_\s]?\d{1,2}[-_\s]?\d{3,8}$/i.test(decodedSegment)
  );
}

export function sanitizeAnalyticsPath(pathname: string) {
  const normalizedPath = pathname.trim().startsWith("/") ? pathname.trim() : `/${pathname.trim()}`;
  const pathWithoutSearch = normalizedPath.split(/[?#]/)[0] || "/";

  if (/^\/psi\/pacientes\/[^/]+$/.test(pathWithoutSearch)) {
    return "/psi/pacientes/:id";
  }

  if (/^\/psi\/prontuarios\/[^/]+$/.test(pathWithoutSearch)) {
    return "/psi/prontuarios/:id";
  }

  return pathWithoutSearch
    .split("/")
    .map((segment) => (segment && isLikelyIdentifier(segment) ? ":id" : segment))
    .join("/") || "/";
}

export function initializeAnalytics() {
  if (!canUseAnalytics() || isInitialized) return;

  const hadExistingGtag = ensureGtag();

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    script.onload = () => {
      canSendPageViewsImmediately = true;
      flushPendingPageView();
    };
    document.head.appendChild(script);
  } else {
    canSendPageViewsImmediately = true;
  }

  if (hadExistingGtag) {
    canSendPageViewsImmediately = true;
  }

  window.gtag?.("js", new Date());
  window.gtag?.("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  });

  isInitialized = true;
}

export function trackPageView(pathname: string) {
  if (!canUseAnalytics()) return;

  initializeAnalytics();

  const pagePath = sanitizeAnalyticsPath(pathname);
  if (pagePath === lastTrackedPath) return;

  lastTrackedPath = pagePath;
  pendingPageViews.push({
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: document.title,
  });

  if (canSendPageViewsImmediately) {
    flushPendingPageView();
  }
}

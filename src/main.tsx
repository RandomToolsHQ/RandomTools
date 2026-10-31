import { publicToolsOnly } from "./deployment";
import { Authentication } from "./auth";
import React, { lazy, Suspense, useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Star,
  ShieldCheck,
  Zap,
  Menu,
  X,
  Command,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { tools, pricing } from "./catalog";
import { api } from "./api";
import "./style.css";
const ToolPage = lazy(() => import("./ToolPage"));
const Account = /* @__PURE__ */ lazy(() => import("./account"));
function ToolRoute() {
  const { id } = useParams();
  return <ToolPage key={id} />;
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
function App() {
  const [menu, setMenu] = useState(false);
  const [light, setLight] = useState(localStorage.getItem("theme") === "light");
  const [analytics, setAnalytics] = useState(
    localStorage.getItem("analytics") === "true",
  );
  const loc = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  useEffect(() => {
    setMenu(false);
    const pathname =
      loc.pathname === "/" ? "/" : loc.pathname.replace(/\/+$/, "");
    const label =
      tools.find((t) => pathname === "/tools/" + t.id)?.name ||
      pathname.split("/")[1] ||
      "Your everyday toolkit";
    document.title = `${label.charAt(0).toUpperCase() + label.slice(1)} · RandomTools HQ`;
    const description =
      tools.find((t) => pathname === "/tools/" + t.id)?.description ||
      `${label} — RandomTools HQ. Useful browser tools with privacy-conscious processing.`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", description);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", document.title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", description);
    const origin = import.meta.env.VITE_SITE_URL;
    const publicPage =
      ["/", "/tools", "/pro", "/privacy", "/terms", "/contact"].includes(
        pathname,
      ) || tools.some((t) => pathname === "/tools/" + t.id);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!publicPage) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex,nofollow";
    } else robots?.remove();
    if (origin && publicPage) {
      let canonical = document.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]',
      );
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = new URL(pathname, origin).href;
      let ogUrl = document.querySelector<HTMLMetaElement>(
        'meta[property="og:url"]',
      );
      if (!ogUrl) {
        ogUrl = document.createElement("meta");
        ogUrl.setAttribute("property", "og:url");
        document.head.appendChild(ogUrl);
      }
      ogUrl.content = canonical.href;
      let structured = document.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"]',
      );
      if (!structured) {
        structured = document.createElement("script");
        structured.type = "application/ld+json";
        document.head.appendChild(structured);
      }
      structured.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: label,
        url: canonical.href,
        description,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web browser",
        ...(tools.some((t) => pathname === "/tools/" + t.id)
          ? { offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" } }
          : {}),
      });
    } else {
      document.querySelector('link[rel="canonical"]')?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
      document.querySelector('script[type="application/ld+json"]')?.remove();
    }
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    localStorage.setItem("theme", light ? "light" : "dark");
  }, [light]);
  return (
    <>
      <a href="#main-content" className="skip-link" tabIndex={0}>
        Skip to content
      </a>
      <header>
        <div className="nav wrap">
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Command size={21} />
            </span>
            RandomTools<span className="hq">HQ</span>
          </Link>
          <nav
            id="main-navigation"
            className={menu ? "open" : ""}
            aria-label="Main navigation"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setMenu(false);
                document
                  .querySelector<HTMLButtonElement>(".mobile-toggle")
                  ?.focus();
              }
            }}
          >
            <Link to="/tools">Explore tools</Link>
            <Link to="/pro">
              RandomTools Pro <span className="tiny">PRO</span>
            </Link>
            <a href="https://github.com/RandomToolsHQ/RandomTools">
              GitHub <ArrowUpRight size={13} />
            </a>
          </nav>
          <div className="nav-actions">
            <button
              aria-label="Toggle colour theme"
              onClick={() => setLight(!light)}
            >
              {light ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            {!publicToolsOnly && (
              <Link
                className="login-link"
                to={me.data?.user ? "/dashboard" : "/login"}
              >
                {me.data?.user ? "Dashboard" : "Log in"}
              </Link>
            )}
            {!publicToolsOnly && (
              <Link className="primary small" to="/register">
                Get started <ArrowRight size={15} />
              </Link>
            )}
            <button
              className="mobile-toggle"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              aria-controls="main-navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main className="wrap" id="main-content" tabIndex={-1}>
        {publicToolsOnly && (
          <p className="privacy" role="status">
            Public tools preview · Accounts, admin and Pro workspaces are
            restricted to authorized testing. Payments are disabled.
          </p>
        )}
        <Suspense fallback={<p className="loading">Loading your workspace…</p>}>
          <Routes>
            <Route path="/" element={<Directory home />} />
            <Route path="/tools" element={<Directory />} />
            <Route path="/tools/:id" element={<ToolRoute />} />
            <Route path="/pro" element={<Pro />} />
            {[
              "login",
              "register",
              "forgot-password",
              "resend-verification",
              "reset-password",
              "verify-email",
              "dashboard",
              "settings",
              "subscription",
              "admin",
            ].map((p) => (
              <Route
                key={p}
                path={"/" + p}
                element={
                  publicToolsOnly ? <Restricted /> : <Account page={p} />
                }
              />
            ))}
            <Route path="/privacy" element={<Legal privacy />} />
            <Route path="/terms" element={<Legal />} />
            <Route
              path="/contact"
              element={
                <section className="text-page">
                  <h1>Let’s talk.</h1>
                  <p>Questions, feedback or a bug? Contact RandomTools HQ.</p>
                  <a className="primary" href="mailto:randomtoolshq@gmail.com">
                    randomtoolshq@gmail.com <ArrowUpRight size={16} />
                  </a>
                </section>
              }
            />
            <Route
              path="*"
              element={
                <section className="text-page">
                  <span className="eyebrow">404 · OFF THE MAP</span>
                  <h1>This tool isn’t here.</h1>
                  <Link className="primary" to="/tools">
                    Find your next tool <ArrowRight size={16} />
                  </Link>
                </section>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <footer className="wrap">
        <div>
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Command size={18} />
            </span>
            RandomTools<span className="hq">HQ</span>
          </Link>
          <p>A little less busywork. A little more possibility.</p>
          <small>© {new Date().getFullYear()} RandomTools HQ</small>
        </div>
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/contact">Contact</Link>
          <a href="https://github.com/RandomToolsHQ/RandomTools">
            Source code ↗
          </a>
        </div>
        {!publicToolsOnly && (
          <button
            className="analytics-toggle"
            aria-pressed={analytics}
            onClick={() => {
              localStorage.setItem("analytics", String(!analytics));
              setAnalytics(!analytics);
            }}
          >
            Anonymous tool counts: {analytics ? "on" : "off"}
          </button>
        )}
      </footer>
    </>
  );
}
function Directory({ home = false }: { home?: boolean }) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select,[contenteditable]")
        )
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [category, setCategory] = useState("All tools");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("favorites") || "[]");
      return Array.isArray(saved)
        ? saved.filter((s: unknown) => typeof s === "string")
        : [];
    } catch {
      return [];
    }
  });
  const reduced = useReducedMotion();
  const availability = useQuery({
    queryKey: ["tools"],
    queryFn: () => api("/tools"),
    staleTime: 300000,
  });
  const filtered = tools.filter(
    (t) =>
      !availability.data?.availability?.some(
        (a: any) => a.tool === t.id && !a.enabled,
      ) &&
      (category === "All tools" ||
        (category === "Favourites" && favorites.includes(t.id)) ||
        t.category === category) &&
      (t.name + " " + t.description)
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  function toggle(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((v) => v !== id)
      : [...favorites, id];
    setFavorites(next);
    localStorage.setItem("favorites", JSON.stringify(next));
  }
  return (
    <>
      {home && (
        <section className="hero">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="hero-pill">
              <span className="dot" /> Small tools. Big possibilities.{" "}
              <ArrowUpRight size={13} />
            </div>
            <h1>
              Your everyday toolkit.
              <br />
              <span>Extraordinarily useful.</span>
            </h1>
            <p>
              Format, convert, create and simplify. Thoughtfully built tools
              <br className="desktop" /> for developers, creators and the
              everyday curious.
            </p>
            <div className="hero-buttons">
              <a className="primary" href="#toolbox">
                Explore the tools <ArrowRight size={17} />
              </a>
              <Link className="secondary" to="/pro">
                Meet RandomTools Pro <Zap size={16} />
              </Link>
            </div>
            <div className="hero-trust">
              <span>
                <Check size={14} />
                18 free tools
              </span>
              <span>
                <Check size={14} />
                No account needed
              </span>
              <span>
                <ShieldCheck size={14} />
                Privacy first
              </span>
            </div>
          </motion.div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="float-tile tile-json">
              {"{ }"}
              <small>JSON</small>
            </div>
            <div className="float-tile tile-colour">
              <i />
              <small>COLOUR</small>
            </div>
            <div className="float-tile tile-code">
              &lt;/&gt;<small>CREATE</small>
            </div>
            <div className="float-tile tile-hash">
              #<small>GENERATE</small>
            </div>
            <span className="spark spark-a">✦</span>
            <span className="spark spark-b">✧</span>
            <span className="art-caption">
              A whole lot of useful. One place.
            </span>
          </div>
        </section>
      )}
      <section id="toolbox" className="toolbox">
        <div className="section-title">
          <div>
            <div className="eyebrow">THE TOOLBOX</div>
            <h2>
              {home
                ? "Good tools. Less friction."
                : "Find your next favourite tool."}
            </h2>
            <p>Pick a tool and get straight to the good part.</p>
          </div>
          <span className="count">18 tools. Always within reach.</span>
        </div>
        <div className="directory-bar">
          <div className="tabs" aria-label="Tool categories">
            {[
              "All tools",
              "Developer",
              "Utilities",
              "Gaming",
              "Favourites",
            ].map((c) => (
              <button
                key={c}
                className={c === category ? "active" : ""}
                aria-pressed={c === category}
                onClick={() => setCategory(c)}
              >
                {c === "Favourites" && <Star size={14} />}
                {c}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search tools"
              ref={searchRef}
              placeholder="Search tools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>/</kbd>
          </label>
        </div>
        <div className="tool-grid">
          {filtered.map((t, i) => (
            <article className="tool-card" key={t.id}>
              <div className="card-top">
                <span className={"tool-icon tone-" + (i % 4)}>{t.icon}</span>
                <button
                  aria-label={`${favorites.includes(t.id) ? "Unfavourite" : "Favourite"} ${t.name}`}
                  aria-pressed={favorites.includes(t.id)}
                  className={favorites.includes(t.id) ? "starred" : ""}
                  onClick={() => toggle(t.id)}
                >
                  <Star size={16} />
                </button>
              </div>
              <Link to={"/tools/" + t.id}>
                <h3>
                  {t.name}
                  <ArrowUpRight size={16} />
                </h3>
                <p>{t.description}</p>
              </Link>
              <div className="card-bottom">
                <span>{t.category}</span>
                <span className="free-label">FREE</span>
              </div>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <p className="empty">No tools found. Try another search.</p>
        )}
      </section>
      <section className="pro-banner">
        <div className="pro-icon">
          <Zap />
        </div>
        <div>
          <span className="eyebrow">A LITTLE MORE POWER</span>
          <h2>Your toolkit, upgraded.</h2>
          <p>
            Batch processing, saved presets and a workspace that remembers you.
          </p>
        </div>
        <Link className="secondary" to="/pro">
          Discover Pro <ArrowRight size={16} />
        </Link>
      </section>
      <div className="values">
        <span>
          <ShieldCheck /> Your files stay yours
          <small>Browser processing by default</small>
        </span>
        <span>
          <Zap /> Ready when you are
          <small>No installs. No unnecessary steps.</small>
        </span>
        <span>
          <Command /> Built with care
          <small>Open source. Thoughtfully designed.</small>
        </span>
      </div>
    </>
  );
}
function Restricted() {
  return (
    <section className="text-page">
      <h1>Restricted testing area</h1>
      <p>
        Accounts, admin and Pro workspaces are available only in controlled
        testing. This public preview includes the 18 free browser tools.
      </p>
      <Link className="primary" to="/tools">
        Explore free tools
      </Link>
    </section>
  );
}
function Pro() {
  if (publicToolsOnly)
    return (
      <section className="text-page">
        <h1>RandomTools Pro</h1>
        <p>
          Batch processing, saved presets, workflows and account features are
          under controlled testing. No subscriptions or payments are available
          on this preview.
        </p>
        <Link className="primary" to="/tools">
          Explore free tools
        </Link>
      </section>
    );
  return (
    <section className="text-page">
      <div className="eyebrow">RANDOMTOOLS PRO</div>
      <h1>More room to do your best work.</h1>
      <p className="lead">
        The everyday essentials are free. Pro brings your workspace together.
      </p>
      <div className="pricing-grid">
        {[
          {
            name: "Free",
            price: "A$0",
            period: "forever",
            items: [
              "All 18 free tools",
              "Local browser processing",
              "Local favourites",
            ],
          },
          {
            name: "Pro Monthly",
            price: `A$${pricing.monthly}`,
            period: "AUD / month · proposed",
            items: [
              "Saved presets and workflows",
              "Cloud preferences and favourites",
              "Private history with retention controls",
              "Batch workspace and advanced exports",
            ],
          },
          {
            name: "Pro Yearly",
            price: `A$${pricing.yearly}`,
            period: "AUD / year · proposed",
            items: [
              "Planned annual option",
              "Not available for purchase",
              "Subject to provider configuration",
            ],
          },
        ].map((p) => (
          <div className="panel price" key={p.name}>
            <h2>{p.name}</h2>
            <strong>{p.price}</strong>
            <p>{p.period}</p>
            {p.items.map((s) => (
              <p key={s}>
                <Check size={16} />
                {s}
              </p>
            ))}
            <Link
              className="secondary"
              to={p.name === "Free" ? "/tools" : "/subscription"}
            >
              {p.name === "Free" ? "Explore tools" : "View membership status"}{" "}
              <ArrowRight size={16} />
            </Link>
          </div>
        ))}
      </div>
      <p>
        Live checkout is disabled. Membership linking requires administrator
        verification of authenticated Ko-fi payments. No automatic cancellation
        detection is promised.
      </p>
    </section>
  );
}
function Legal({ privacy = false }: { privacy?: boolean }) {
  return (
    <article className="text-page prose">
      <div className="eyebrow">LAST UPDATED · 31 OCTOBER 2026</div>
      <h1>{privacy ? "Privacy policy" : "Terms of service"}</h1>
      {privacy ? (
        <>
          <h2>Your tools, your data</h2>
          <p>
            Free tools process text and files locally in your browser. Tool
            inputs are not sent to our server. Local favourites and theme
            preferences are stored on your device.
          </p>
          {publicToolsOnly && (
            <p>
              This public tools preview has no account signup, saved server
              data, analytics collection or live payments. Clerk development
              authentication is not loaded on this public frontend.
            </p>
          )}
          <h2>Accounts and storage</h2>
          <p>
            Clerk manages authentication for controlled testing. D1 stores
            application profiles and session records. Pro users may explicitly
            save presets, workflows and history. Account settings provide
            export, retention and deletion controls. Payment notifications are
            retained for membership reconciliation; do not submit sensitive tool
            content to saved records.
          </p>
          <h2>Service providers and retention</h2>
          <p>
            Hosting uses Cloudflare. Membership payments are handled by Ko-fi
            under its own privacy terms. When configured, Resend receives your
            email address and one-time verification or reset message for
            transactional delivery. Audit records are retained for 180 days and
            aggregate usage counts for 90 days. Saved history follows your
            selected retention period, with daily cleanup that may lag by up to
            24 hours. We do not sell personal information. Contact
            randomtoolshq@gmail.com for access or privacy requests.
          </p>
        </>
      ) : (
        <>
          <h2>Using RandomTools</h2>
          <p>
            Use the service lawfully and do not attack, disrupt or misuse other
            users’ data. Tools are provided as available, without a guarantee
            that results suit a particular purpose. Verify critical results
            independently.
          </p>
          <h2>Memberships</h2>
          <p>
            Prices are in AUD. Proposed plans are not offers for active
            checkout. Confirmed memberships expire on their paid-through date.
            Ko-fi manages payment and cancellation; account linking may require
            manual verification. Contact support about billing or access issues.
          </p>
          <h2>Your rights</h2>
          <p>
            Nothing in these terms excludes rights that cannot be excluded under
            Australian Consumer Law. The service may change; material account or
            subscription changes should be communicated before they take effect.
          </p>
        </>
      )}
      <h2>Contact</h2>
      <a href="mailto:randomtoolshq@gmail.com">randomtoolshq@gmail.com</a>
      <p>
        These initial policies require business and legal review before public
        launch.
      </p>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        {publicToolsOnly ? (
          <App />
        ) : (
          <Authentication>
            <App />
          </Authentication>
        )}
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

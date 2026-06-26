import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";
import { PLATFORM_CONFIGS } from "@/lib/platforms";

export const Footer = () => (
  <footer className="bg-background">
    <div className="container py-6">
      <div className="grid gap-6 md:grid-cols-3 items-start">
        <div>
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logo}
              alt="MDounloader logo"
              width={32}
              height={32}
              loading="lazy"
              className="h-8 w-8 rounded-lg shadow-elegant"
            />
            <div>
              <span className="block text-base font-semibold">MDounloader</span>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                A multi-platform downloader for public TikTok, Instagram, Facebook, YouTube, X, LinkedIn, and TinyURL workflows.
              </p>
            </div>
          </Link>
        </div>

        <div>
          <h4 className="text-sm font-semibold">Platforms</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {PLATFORM_CONFIGS.map((platform) => (
              <li key={platform.key} className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" aria-hidden />
                <Link to={platform.route} className="hover:text-foreground flex items-center gap-1.5">
                  <span>{platform.name}</span>
                  {platform.paused && (
                    <span className="text-[9px] font-semibold text-destructive uppercase tracking-wider bg-destructive/5 px-1 rounded border border-destructive/10">
                      Paused
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold">Product</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" aria-hidden />
              <Link to="/" className="hover:text-foreground">Home</Link>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" aria-hidden />
              <Link to="/pro" className="hover:text-foreground">Pro</Link>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" aria-hidden />
              <Link to="/auth" className="hover:text-foreground">Account</Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-border/30 to-transparent rounded" />
      </div>

      <div className="mt-4 flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
        <p>Copyright 2026 MDounloader. Public links only.</p>
        <p className="text-center sm:text-right">Built for quick, direct downloads.</p>
      </div>
    </div>
  </footer>
);

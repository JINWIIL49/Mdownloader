import { ChevronDown, LogOut, Menu, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.png";
import { PLATFORM_CONFIGS } from "@/lib/platforms";

const primaryLinks = [{ href: "/", label: "Home" }];

// Exclude `tinyurl` and `background-remover` from the Downloaders dropdown —
// `background-remover` is shown as its own button next to the primary Download action.
const downloaderLinks = PLATFORM_CONFIGS.filter((platform) => !["tinyurl", "background-remover"].includes(platform.key));

type DownloaderMenuProps = {
  onItemClick?: () => void;
  triggerClassName?: string;
};

const DownloaderMenu = ({ onItemClick, triggerClassName }: DownloaderMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        className={`text-sm font-medium text-muted-foreground hover:text-foreground ${triggerClassName ?? ""}`}
      >
        <span>Downloaders</span>
        <ChevronDown className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="center" className="w-56">
      {downloaderLinks.map((platform) => {
        const Icon = platform.icon;
        return (
          <DropdownMenuItem key={platform.key} asChild>
            <Link
              to={platform.route}
              onClick={onItemClick}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground w-full"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{platform.name}</span>
              </div>
              {platform.paused && (
                <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-destructive border border-destructive/20">
                  Paused
                </span>
              )}
            </Link>
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
);

export const Header = () => {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const ThemeIcon = theme === "dark" ? Sun : Moon;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <img
            src={logo}
            alt="MDounloader logo"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-xl shadow-elegant"
          />
          <span className="truncate text-base font-bold tracking-tight sm:text-lg">MDounloader</span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          {primaryLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors hover:text-foreground ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <DownloaderMenu />
          <NavLink
            to="/tinyurl"
            className={({ isActive }) =>
              `text-sm font-medium transition-colors hover:text-foreground ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            Shorteners
          </NavLink>
          <NavLink
            to="/pro"
            className={({ isActive }) =>
              `text-sm font-medium transition-colors hover:text-foreground ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`
            }
          >
            Pro
          </NavLink>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <ThemeIcon className="h-5 w-5" />
          </Button>
          {user ? (
            <>
              <span
                className="hidden max-w-[160px] truncate text-sm text-muted-foreground 2xl:inline"
                title={user.email ?? ""}
              >
                {user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-1 h-4 w-4" /> Log out
              </Button>
            </>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Log in</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="mr-2">
            <Link to="/background-remover">Background Remover</Link>
          </Button>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <ThemeIcon className="h-5 w-5" />
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[78vw] max-w-[320px] p-0">
              <SheetHeader className="border-b border-border/60 px-6 py-4 text-left">
                <SheetTitle className="flex items-center gap-2">
                  <img src={logo} alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
                  <span>MDounloader</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex h-[calc(100%-65px)] flex-col justify-between px-6 py-6">
                <nav className="grid gap-1">
                  {primaryLinks.map((link) => (
                    <NavLink
                      key={link.href}
                      to={link.href}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `rounded-md px-3 py-2.5 text-base font-medium transition-colors ${
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                  <div className="px-1 py-1">
                    <DownloaderMenu onItemClick={() => setOpen(false)} triggerClassName="w-full justify-between rounded-md px-3 py-2.5 text-base font-medium text-muted-foreground hover:text-foreground" />
                  </div>
                  <NavLink
                    to="/tinyurl"
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-2.5 text-base font-medium transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`
                    }
                  >
                    Shorteners
                  </NavLink>
                  <NavLink
                    to="/pro"
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `rounded-md px-3 py-2.5 text-base font-medium transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`
                    }
                  >
                    Pro
                  </NavLink>
                </nav>
                <div className="flex flex-col gap-2 pt-6">
                  {user ? (
                    <>
                      <p className="truncate px-3 text-xs text-muted-foreground" title={user.email ?? ""}>
                        Signed in as <span className="font-medium text-foreground">{user.email}</span>
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setOpen(false);
                          void handleSignOut();
                        }}
                      >
                        <LogOut className="mr-2 h-4 w-4" /> Log out
                      </Button>
                    </>
                  ) : (
                    <Button asChild variant="outline">
                      <Link to="/auth" onClick={() => setOpen(false)}>
                        Log in
                      </Link>
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button asChild variant="outline">
                      <Link to="/background-remover" onClick={() => setOpen(false)}>
                        Background Remover
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

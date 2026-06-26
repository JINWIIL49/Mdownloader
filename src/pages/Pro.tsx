import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Crown, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/site/PageShell";
import BackToHome from "@/components/site/BackToHome";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// Local type — `subscribers` is not yet in the auto-generated Supabase types.
// Remove this and use `Tables<"subscribers">` once types regenerate.
type SubscriberRow = {
  user_id: string;
  email: string | null;
  is_pro: boolean;
  paystack_reference: string | null;
  paystack_customer_code: string | null;
  current_period_end: string | null;
};

const PERKS = [
  "Unlimited downloads (no daily limit)",
  "HD video quality",
  "MP3 audio extraction",
  "Slideshow ZIP downloads",
  "Priority support",
];

const Pro = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [upgrading, setUpgrading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const verificationInFlightRef = useRef(false);
  const verifiedReferenceRef = useRef<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<
    | { kind: "success"; periodEnd: string | null }
    | { kind: "failure"; message: string }
    | { kind: "cancelled" }
    | null
  >(null);
  const returnReference = params.get("reference") || params.get("trxref");
  const verificationLocked = verifying || (!!returnReference && verifyResult === null);

  // Load existing subscription status
  useEffect(() => {
    if (!user) return;
    const client = supabase as unknown as {
      from: (table: "subscribers") => {
        select: (cols: string) => {
          eq: (col: "user_id", val: string) => {
            maybeSingle: () => Promise<{
              data: Pick<SubscriberRow, "is_pro" | "current_period_end"> | null;
            }>;
          };
        };
      };
    };
    client
      .from("subscribers")
      .select("is_pro, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const active =
            !!data.is_pro &&
            (!data.current_period_end || new Date(data.current_period_end) > new Date());
          setIsPro(active);
          setPeriodEnd(data.current_period_end);
        }
      });
  }, [user]);

  // Verify-on-return: Paystack appends ?reference=... and ?trxref=...
  useEffect(() => {
    const reference = params.get("reference") || params.get("trxref");

    // Cancel detection: we set a flag in sessionStorage right before redirecting
    // to Paystack. If the user comes back here with no reference, they cancelled.
    if (!reference) {
      const pending = sessionStorage.getItem("paystack_pending");
      if (pending) {
        sessionStorage.removeItem("paystack_pending");
        setVerifyResult({ kind: "cancelled" });
      }
      return;
    }
    if (!user) return;
    if (verificationInFlightRef.current || verifiedReferenceRef.current === reference) return;

    verificationInFlightRef.current = true;
    verifiedReferenceRef.current = reference;
    // We have a reference — clear the pending flag, this wasn't a cancel.
    sessionStorage.removeItem("paystack_pending");
    setVerifying(true);
    setVerifyResult(null);
    supabase.functions
      .invoke("paystack-verify", { body: { reference } })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        if (data?.is_pro) {
          setIsPro(true);
          setPeriodEnd(data.current_period_end ?? null);
          setVerifyResult({ kind: "success", periodEnd: data.current_period_end ?? null });
          toast.success("Welcome to Pro! 🎉");
        } else {
          const msg =
            data?.status === "abandoned"
              ? "Payment was cancelled before completion."
              : "Payment was not successful. Please try again.";
          setVerifyResult({ kind: "failure", message: msg });
          toast.error(msg);
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Verification failed";
        setVerifyResult({ kind: "failure", message: msg });
        toast.error(msg);
      })
      .finally(() => {
        verificationInFlightRef.current = false;
        setVerifying(false);
        // Clean URL
        params.delete("reference");
        params.delete("trxref");
        params.delete("verify");
        setParams(params, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleUpgrade = async () => {
    if (!user) {
      navigate("/auth?redirect=/pro");
      return;
    }
    setUpgrading(true);
    try {
      const callbackUrl = `${window.location.origin}/pro`;
      // Mark that we're heading to Paystack so we can detect cancel-on-return.
      sessionStorage.setItem("paystack_pending", "1");
      const { data, error } = await supabase.functions.invoke("paystack-initialize", {
        body: { callback_url: callbackUrl },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (e) {
      sessionStorage.removeItem("paystack_pending");
      toast.error(e instanceof Error ? e.message : "Failed to start checkout");
      setUpgrading(false);
    }
  };

  return (
    <PageShell>
      <main className="relative min-h-screen overflow-hidden text-foreground">
      <div className="absolute inset-0 -z-10 bg-gradient-soft" />
      <div className="absolute -top-24 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <div className="container py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mt-6 flex items-center justify-center gap-3">
            <BackToHome className="rounded-full px-4 py-1.5 text-xs font-medium" />
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
              <Crown className="h-3.5 w-3.5 text-primary" />
              MDounloader Pro
            </span>
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Go <span className="text-gradient">unlimited</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
            Remove the daily download limit and support the project.
          </p>
        </div>

        <Card className="mx-auto mt-10 max-w-md p-8 shadow-elegant">
          {verifying ? (
            <div className="space-y-6" aria-busy="true" aria-live="polite">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Verifying payment…</span>
              </div>
              {/* Price */}
              <div className="flex items-baseline justify-center gap-2">
                <Skeleton className="h-12 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              {/* Perks */}
              <div className="space-y-3">
                {PERKS.map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
              {/* CTA */}
              <Skeleton className="h-11 w-full" />
              <Skeleton className="mx-auto h-3 w-3/4" />
            </div>
          ) : (
          <>
          {verifyResult && (
            <Alert
              className={
                verifyResult.kind === "success"
                  ? "mb-6 border-primary/40 bg-primary/10"
                  : verifyResult.kind === "cancelled"
                    ? "mb-6 border-muted-foreground/30 bg-muted"
                    : "mb-6"
              }
              variant={verifyResult.kind === "failure" ? "destructive" : "default"}
            >
              {verifyResult.kind === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : verifyResult.kind === "cancelled" ? (
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {verifyResult.kind === "success"
                  ? "Payment successful"
                  : verifyResult.kind === "cancelled"
                    ? "Checkout cancelled"
                    : "Payment failed"}
              </AlertTitle>
              <AlertDescription>
                {verifyResult.kind === "success"
                  ? `You're now on Pro${verifyResult.periodEnd ? ` until ${new Date(verifyResult.periodEnd).toLocaleDateString()}` : ""}.`
                  : verifyResult.kind === "cancelled"
                    ? "You closed the checkout before paying. You can try again anytime."
                    : verifyResult.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-baseline justify-center gap-1">
            <span className="text-5xl font-extrabold">KES 39</span>
            <span className="text-muted-foreground">/month</span>
          </div>

          <ul className="mt-6 space-y-3">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            {verifying ? (
              <Button disabled size="lg" className="w-full bg-gradient-hero">
                <Loader2 className="h-5 w-5 animate-spin" /> Verifying payment...
              </Button>
            ) : isPro ? (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-center text-sm">
                <p className="font-semibold text-primary">
                  <Crown className="mr-1 inline h-4 w-4" /> You're on Pro
                </p>
                {periodEnd && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Renews / expires {new Date(periodEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : authLoading ? (
              <Button disabled size="lg" className="w-full">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading...
              </Button>
            ) : (
              <Button
                onClick={handleUpgrade}
                disabled={upgrading || verificationLocked}
                size="lg"
                className="w-full bg-gradient-hero text-base font-semibold shadow-elegant"
              >
                {upgrading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Redirecting to Paystack...
                  </>
                ) : verificationLocked ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Finalizing payment...
                  </>
                ) : (
                  <>
                    <Crown className="h-5 w-5" /> {user ? "Upgrade to Pro" : "Sign in to Upgrade"}
                  </>
                )}
              </Button>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Secure payment powered by Paystack. Cancel anytime.
          </p>
          </>
          )}
        </Card>
      </div>
    </main>
    </PageShell>
  );
};

export default Pro;

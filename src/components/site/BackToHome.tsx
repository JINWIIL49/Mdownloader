import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

const BackToHome = ({ className, children }: Props) => {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-background/70 px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-soft hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Link to="/" aria-label="Back to home">
        <ArrowLeft className="h-4 w-4" />
        <span>{children ?? "Back to home"}</span>
      </Link>
    </Button>
  );
};

export default BackToHome;

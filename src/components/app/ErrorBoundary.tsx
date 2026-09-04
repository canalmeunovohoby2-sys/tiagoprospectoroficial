import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] React render crash prevented", { error, componentStack: errorInfo.componentStack });
  }

  private reset = () => {
    console.info("[ErrorBoundary] reset requested");
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center">
          <Card className="w-full border-destructive/30 bg-card p-6 shadow-elegant">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <div>
                  <h1 className="font-display text-2xl font-semibold">A interface foi protegida</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Um componente encontrou um erro, mas a aplicação não foi derrubada. Tente novamente.
                  </p>
                </div>
                {this.state.error?.message && (
                  <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    {this.state.error.message}
                  </p>
                )}
                <Button onClick={this.reset} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Tentar novamente
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }
}
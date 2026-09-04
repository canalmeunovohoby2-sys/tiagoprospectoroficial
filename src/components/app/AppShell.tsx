import { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Moon, Sun, LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, signOut, isAnonymous } = useAuth();
  const { theme, toggle } = useTheme();

  const displayName = user?.user_metadata?.full_name || user?.email || "Tiago";

  const initials = displayName
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border/60 flex items-center justify-between px-4 sticky top-0 z-30 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="hidden md:block text-sm text-muted-foreground">
                <span className="font-medium text-foreground">LeadHunter</span> · Prospecção B2B
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 px-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-sm max-w-[140px] truncate">{displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {displayName}
                  </DropdownMenuLabel>
                  {user && !isAnonymous && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={signOut} className="text-destructive">
                        <LogOut className="h-4 w-4 mr-2" /> Sair
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden">{children ?? <Outlet />}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

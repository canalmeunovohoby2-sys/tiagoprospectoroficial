import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Users,
  History,
  Target,
  ListChecks,
  Briefcase,
  Radar,
  Stethoscope,
  MessageSquareQuote,
  FileText,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Pesquisar Leads", url: "/search", icon: Search },
  { title: "Meus Leads", url: "/leads", icon: Users },
  { title: "Fila de Espera", url: "/queue", icon: ListChecks },
  { title: "Serviços", url: "/services", icon: Briefcase },
  { title: "Histórico", url: "/history", icon: History },
];

const orvixItems = [
  { title: "Prospectar", url: "/orvix/prospectar", icon: Radar },
  { title: "Diagnóstico", url: "/orvix/diagnostico", icon: Stethoscope },
  { title: "Argumentos", url: "/orvix/argumentos", icon: MessageSquareQuote },
  { title: "Propostas", url: "/orvix/propostas", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20 bg-sidebar/60 backdrop-blur-xl">
      <SidebarHeader className="border-b border-primary/15 h-14 flex-row items-center px-3">
        <div className="h-8 w-8 rounded-xl bg-gradient-primary flex items-center justify-center shadow-[0_0_20px_hsl(0_84%_55%/0.45)] shrink-0">
          <Target className="h-4 w-4 text-primary-foreground" strokeWidth={2.8} />
        </div>
        {!collapsed && (
          <div className="ml-2">
            <div className="font-display font-bold text-sm leading-tight tracking-tight">LeadHunter</div>
            <div className="text-[10px] text-primary/80 leading-tight uppercase tracking-[0.18em]">Brasil</div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 px-2 mb-1">
              Navegação
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={[
                        "group/menu-btn relative h-11 rounded-xl px-3 overflow-hidden",
                        "border transition-all duration-300 ease-out",
                        "hover:scale-[1.02] hover:-translate-y-[1px]",
                        active
                          ? "border-primary/60 bg-primary/10 text-foreground shadow-[0_0_24px_-4px_hsl(0_84%_55%/0.55)]"
                          : "border-transparent bg-sidebar-accent/30 text-sidebar-foreground hover:border-primary/45 hover:bg-primary/8 hover:text-foreground hover:shadow-[0_0_18px_-4px_hsl(0_84%_55%/0.55)]",
                        "data-[active=true]:border-primary/60 data-[active=true]:bg-primary/10 data-[active=true]:text-foreground",
                        "data-[active=true]:shadow-[0_0_24px_-4px_hsl(0_84%_55%/0.55)]",
                      ].join(" ")}
                    >
                      <NavLink to={item.url} end={item.url === "/"} className="flex items-center gap-3 w-full">
                        {/* Active rail */}
                        <span
                          aria-hidden
                          className={[
                            "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-300",
                            active
                              ? "h-7 bg-primary shadow-[0_0_10px_hsl(0_84%_55%/0.9)]"
                              : "h-0 bg-primary group-hover/menu-btn:h-5 group-hover/menu-btn:shadow-[0_0_10px_hsl(0_84%_55%/0.9)]",
                          ].join(" ")}
                        />
                        <span
                          className={[
                            "flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-all duration-300",
                            active
                              ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                              : "bg-background/40 text-sidebar-foreground group-hover/menu-btn:bg-primary/12 group-hover/menu-btn:text-primary group-hover/menu-btn:ring-1 group-hover/menu-btn:ring-primary/40",
                          ].join(" ")}
                        >
                          <item.icon className="h-[15px] w-[15px] transition-transform duration-300 group-hover/menu-btn:scale-110" />
                        </span>
                        {!collapsed && (
                          <span className={["text-sm font-medium tracking-tight transition-colors", active ? "text-foreground" : ""].join(" ")}>
                            {item.title}
                          </span>
                        )}
                        {active && !collapsed && (
                          <span
                            aria-hidden
                            className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(0_84%_55%/0.9)] animate-pulse"
                          />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 px-2 mb-1 mt-2">
              Orvix ERP
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {orvixItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={[
                        "group/menu-btn relative h-11 rounded-xl px-3 overflow-hidden",
                        "border transition-all duration-300 ease-out",
                        "hover:scale-[1.02] hover:-translate-y-[1px]",
                        active
                          ? "border-primary/60 bg-primary/10 text-foreground shadow-[0_0_24px_-4px_hsl(0_84%_55%/0.55)]"
                          : "border-transparent bg-sidebar-accent/30 text-sidebar-foreground hover:border-primary/45 hover:bg-primary/8 hover:text-foreground hover:shadow-[0_0_18px_-4px_hsl(0_84%_55%/0.55)]",
                        "data-[active=true]:border-primary/60 data-[active=true]:bg-primary/10 data-[active=true]:text-foreground",
                        "data-[active=true]:shadow-[0_0_24px_-4px_hsl(0_84%_55%/0.55)]",
                      ].join(" ")}
                    >
                      <NavLink to={item.url} className="flex items-center gap-3 w-full">
                        <span
                          aria-hidden
                          className={[
                            "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-300",
                            active
                              ? "h-7 bg-primary shadow-[0_0_10px_hsl(0_84%_55%/0.9)]"
                              : "h-0 bg-primary group-hover/menu-btn:h-5 group-hover/menu-btn:shadow-[0_0_10px_hsl(0_84%_55%/0.9)]",
                          ].join(" ")}
                        />
                        <span
                          className={[
                            "flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-all duration-300",
                            active
                              ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                              : "bg-background/40 text-sidebar-foreground group-hover/menu-btn:bg-primary/12 group-hover/menu-btn:text-primary group-hover/menu-btn:ring-1 group-hover/menu-btn:ring-primary/40",
                          ].join(" ")}
                        >
                          <item.icon className="h-[15px] w-[15px] transition-transform duration-300 group-hover/menu-btn:scale-110" />
                        </span>
                        {!collapsed && (
                          <span className={["text-sm font-medium tracking-tight transition-colors", active ? "text-foreground" : ""].join(" ")}>
                            {item.title}
                          </span>
                        )}
                        {active && !collapsed && (
                          <span
                            aria-hidden
                            className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(0_84%_55%/0.9)] animate-pulse"
                          />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}


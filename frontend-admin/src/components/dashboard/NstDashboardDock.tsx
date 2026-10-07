"use client";

import { Boxes, ClipboardList, Gauge, PackageCheck, Settings2, ShoppingBag } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import DockTabs from "../ui/dock-tabs";

const items = [
  { id: "/dashboard", label: "Dashboard", icon: <Gauge /> },
  { id: "/sales/create", label: "POS", icon: <ShoppingBag /> },
  { id: "/products", label: "Products", icon: <Boxes /> },
  { id: "/device-stock", label: "Stock", icon: <PackageCheck /> },
  { id: "/orders", label: "Orders", icon: <ClipboardList /> },
  { id: "/settings", label: "Settings", icon: <Settings2 /> },
];

export default function NstDashboardDock() {
  const navigate = useNavigate();
  const location = useLocation();

  const active =
    items.find(
      (item) =>
        location.pathname === item.id ||
        location.pathname.startsWith(`${item.id}/`)
    )?.id || "/dashboard";

  return <DockTabs items={items} activeId={active} onChange={navigate} />;
}

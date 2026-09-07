"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import NavDropdown from "./NavDropdown";

const esActiva = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {NAV.map((entry) =>
        entry.items ? (
          <NavDropdown key={entry.label} entry={entry} />
        ) : (
          <Link
            key={entry.label}
            href={entry.href!}
            className={`rounded-md px-2 py-1.5 transition-colors ${
              esActiva(pathname, entry.href!) ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {entry.label}
          </Link>
        ),
      )}
    </nav>
  );
}

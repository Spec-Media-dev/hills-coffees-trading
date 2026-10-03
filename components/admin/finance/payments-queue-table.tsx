"use client";

import * as React from "react";
import type { PaymentQueueItemDTO } from "@/lib/finance/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

export type PaymentsQueueTableProps = {
  items: PaymentQueueItemDTO[];
  selectedOrderId?: string | null;
  onSelectOrder: (orderId: string) => void;
  isLoading?: boolean;
};

export function PaymentsQueueTable({
  items,
  selectedOrderId,
  onSelectOrder,
  isLoading = false,
}: PaymentsQueueTableProps) {
  const [search, setSearch] = React.useState("");

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.orderCode.toLowerCase().includes(q) ||
        item.buyerOrganizationName.toLowerCase().includes(q) ||
        item.bankReference.toLowerCase().includes(q)
    );
  }, [items, search]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-sm" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 w-full animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Input
            type="search"
            placeholder="Search by order code, buyer, or ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pe-9"
            aria-label="Filter pending payments"
          />
          <Icon
            name="search"
            className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {filteredItems.length} {filteredItems.length === 1 ? "payment" : "payments"} pending
          </Badge>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-12 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground mb-3">
            <Icon name="wallet" className="size-6" />
          </div>
          <h3 className="font-heading text-base font-semibold text-foreground">
            No payments pending verification
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search.trim()
              ? "No pending payments match your search filter."
              : "All submitted bank transfer proofs have been reviewed."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
            <table className="w-full text-start text-sm border-collapse" role="table">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start">Order</th>
                  <th scope="col" className="px-4 py-3 text-start">Buyer</th>
                  <th scope="col" className="px-4 py-3 text-start">Order Total</th>
                  <th scope="col" className="px-4 py-3 text-start">Claimed Proof</th>
                  <th scope="col" className="px-4 py-3 text-start">Submitted</th>
                  <th scope="col" className="px-4 py-3 text-start">Hold Status</th>
                  <th scope="col" className="px-4 py-3 text-end">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const isSelected = selectedOrderId === item.orderId;
                  const formattedDate = new Date(item.submittedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr
                      key={item.orderId}
                      tabIndex={0}
                      role="row"
                      aria-selected={isSelected}
                      onClick={() => onSelectOrder(item.orderId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectOrder(item.orderId);
                        }
                      }}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                        isSelected && "bg-muted/70 font-medium"
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.orderCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {item.buyerOrganizationName}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-foreground">
                        {item.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        <span className="text-xs text-muted-foreground">{item.currency}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground">
                            {item.claimedAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            <span className="text-xs text-muted-foreground">{item.claimedCurrency}</span>
                          </span>
                          {item.bankReference ? (
                            <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={item.bankReference}>
                              Ref: {item.bankReference}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formattedDate}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge
                          variant={item.reservationStatus === "REVIEW_HOLD" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {item.reservationStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-end whitespace-nowrap">
                        <Button
                          size="sm"
                          variant={isSelected ? "primary" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectOrder(item.orderId);
                          }}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile/Tablet Card List */}
          <div className="flex flex-col gap-3 md:hidden">
            {filteredItems.map((item) => {
              const isSelected = selectedOrderId === item.orderId;
              const formattedDate = new Date(item.submittedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={item.orderId}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => onSelectOrder(item.orderId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectOrder(item.orderId);
                    }
                  }}
                  className={cn(
                    "flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    isSelected && "border-primary bg-muted/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {item.orderCode}
                    </span>
                    <Badge variant={item.reservationStatus === "REVIEW_HOLD" ? "default" : "outline"}>
                      {item.reservationStatus}
                    </Badge>
                  </div>

                  <div className="text-sm font-medium text-foreground">
                    {item.buyerOrganizationName}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t border-border">
                    <div>
                      <span>Due: </span>
                      <strong className="text-foreground">
                        {item.amount.toFixed(2)} {item.currency}
                      </strong>
                    </div>
                    <div>
                      <span>Claimed: </span>
                      <strong className="text-foreground">
                        {item.claimedAmount.toFixed(2)} {item.claimedCurrency}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                    <span>{formattedDate}</span>
                    <Button size="sm" variant={isSelected ? "primary" : "outline"}>
                      Inspect
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

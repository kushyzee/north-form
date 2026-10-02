"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";

/**
 * One cart line. Client Component because every control mutates local cart
 * state — the authoritative price and stock come from the database at checkout.
 */
export function CartLineItem({ lineId }: { lineId: string }) {
  const { items, incrementItem, decrementItem, setQuantity, removeItem } =
    useCart();
  const item = items.find((entry) => entry.lineId === lineId);

  if (!item) return null;

  const lineTotal = item.unitPrice * item.quantity;
  const atMaxQuantity = item.quantity >= item.maxQuantity;
  const atMinQuantity = item.quantity <= 1;

  return (
    <li className="flex gap-4 py-6 sm:gap-6">
      {/* Image */}
      <Link
        href={`/shop/${item.productSlug}`}
        className="relative aspect-4/5 w-24 shrink-0 overflow-hidden bg-brand-stone/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none sm:w-32"
      >
        {item.productImage ? (
          <Image
            src={item.productImage}
            alt={item.productName}
            fill
            sizes="128px"
            className="object-cover"
          />
        ) : (
          <span className="sr-only">{item.productName}</span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-4 pr-2">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              {item.categoryName}
            </p>
            <h3 className="mt-1 text-sm font-medium sm:text-base">
              <Link
                href={`/shop/${item.productSlug}`}
                className="hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {item.productName}
              </Link>
            </h3>
            {item.size ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Size: <span className="text-foreground">{item.size}</span>
              </p>
            ) : null}
          </div>

          <p className="text-sm font-medium whitespace-nowrap tabular-nums sm:text-base">
            {formatNaira(lineTotal)}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {formatNaira(item.unitPrice)} each
        </p>

        <div className="mt-3 flex items-center gap-3">
          {/* Quantity stepper */}
          <div className="flex h-10 items-center rounded-md border border-border">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-10 w-10 rounded-none rounded-l-md"
              onClick={() => decrementItem(item.lineId)}
              disabled={atMinQuantity}
            >
              <Minus aria-hidden="true" />
              <span className="sr-only">
                Decrease quantity of {item.productName}
                {item.size ? `, size ${item.size}` : ""}
              </span>
            </Button>

            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={item.maxQuantity}
              value={item.quantity}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(next)) setQuantity(item.lineId, next);
              }}
              aria-label={`Quantity of ${item.productName}${
                item.size ? `, size ${item.size}` : ""
              }`}
              className="w-10 border-0 bg-transparent text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-10 w-10 rounded-none rounded-r-md"
              onClick={() => incrementItem(item.lineId)}
              disabled={atMaxQuantity}
            >
              <Plus aria-hidden="true" />
              <span className="sr-only">
                Increase quantity of {item.productName}
                {item.size ? `, size ${item.size}` : ""}
              </span>
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeItem(item.lineId)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
            Remove
            <span className="sr-only">
              {" "}
              {item.productName}
              {item.size ? `, size ${item.size}` : ""}
            </span>
          </Button>
        </div>

        {/* Stock ceiling notice, so the disabled "+" is never a mystery. */}
        {atMaxQuantity && item.maxQuantity > 1 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Maximum available quantity reached.
          </p>
        ) : null}
      </div>
    </li>
  );
}

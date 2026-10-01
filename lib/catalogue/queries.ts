import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Category, Product, ProductSort } from "@/lib/catalogue/types"

/**
 * Public catalogue reads.
 *
 * These use the anon publishable key through the server client, so they run
 * under the existing RLS policies (`anon` may only `SELECT` from `categories`
 * and `products`). No write path is exposed here by design — see AGENTS.md.
 */

/** Columns we actually need. Selecting explicitly keeps payloads small. */
const PRODUCT_COLUMNS =
  "id, name, slug, description, price, stock_quantity, sizes, images, featured, category:categories!inner(id, name, slug, description)"

/**
 * The Supabase client has no generated `Database` type in this project, so
 * `data` arrives as an untyped row. Rather than sprinkling `any` through the
 * app, every row is validated here and narrowed to a real domain type.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

/** PostgREST returns `numeric` as a JSON number here, but tolerate strings. */
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toCategory(value: unknown): Category | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const name = asString(value.name)
  const slug = asString(value.slug)
  if (!id || !name || !slug) return null
  return { id, name, slug, description: asString(value.description) }
}

function toProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const name = asString(value.name)
  const slug = asString(value.slug)
  const description = asString(value.description)
  const price = asNumber(value.price)
  const stockQuantity = asNumber(value.stock_quantity)
  const category = toCategory(value.category)

  if (
    !id ||
    !name ||
    !slug ||
    !description ||
    price === null ||
    stockQuantity === null ||
    !category
  ) {
    return null
  }

  return {
    id,
    name,
    slug,
    description,
    price,
    stockQuantity,
    sizes: asStringArray(value.sizes),
    images: asStringArray(value.images),
    featured: value.featured === true,
    category,
  }
}

function toProducts(value: unknown): Product[] {
  if (!Array.isArray(value)) return []
  return value.map(toProduct).filter((product): product is Product => product !== null)
}

function toCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return []
  return value
    .map(toCategory)
    .filter((category): category is Category => category !== null)
}

/** All categories, alphabetically, for filter UI and footer links. */
export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description")
    .order("name", { ascending: true })

  if (error) {
    // Logged server-side only; the UI never surfaces raw PostgREST messages.
    console.error("[catalogue] getCategories failed:", error.message)
    return []
  }

  return toCategories(data)
}

export type ProductQuery = {
  /** Exact category slug to filter by. */
  category?: string | undefined
  /** Free-text term matched against product name and description. */
  search?: string | undefined
  sort?: ProductSort | undefined
}

/**
 * Escape a user-supplied search term for use inside a PostgREST `or=` filter.
 * Commas and parentheses would otherwise change the filter's structure.
 */
function toLikePattern(term: string): string {
  return `%${term.replace(/[,%().\\]/g, " ").trim()}%`
}

/**
 * The product listing. Filtering, search and sorting all happen in Postgres so
 * the client never receives the whole catalogue just to sort it.
 */
/**
 * The product listing. Filtering, search and sorting all happen in Postgres so
 * the client never receives the whole catalogue just to sort it.
 *
 * The query is built as one chain rather than reassigned, which keeps the
 * builder's inferred row type intact.
 */
export async function getProducts({
  category,
  search,
  sort = "featured",
}: ProductQuery = {}): Promise<Product[]> {
  const supabase = await createClient()

  // Filters first. `categories!inner` means the embedded category is filtered,
  // not merely joined.
  let builder = supabase.from("products").select(PRODUCT_COLUMNS)

  if (category) {
    builder = builder.eq("category.slug", category)
  }

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const pattern = toLikePattern(trimmedSearch)
    builder = builder.or(`name.ilike.${pattern},description.ilike.${pattern}`)
  }

  // Sorting. `name` is appended as a stable tiebreaker for every option except
  // name-asc itself, so equal prices or dates never shuffle between renders.
  switch (sort) {
    case "price-asc":
      builder = builder.order("price", { ascending: true }).order("name")
      break
    case "price-desc":
      builder = builder.order("price", { ascending: false }).order("name")
      break
    case "name-asc":
      builder = builder.order("name", { ascending: true })
      break
    case "newest":
      builder = builder.order("created_at", { ascending: false }).order("name")
      break
    case "featured":
    default:
      builder = builder
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false })
        .order("name")
      break
  }

  const { data, error } = await builder

  if (error) {
    console.error("[catalogue] getProducts failed:", error.message)
    return []
  }

  return toProducts(data)
}

/** Products explicitly flagged `featured`, for the homepage. */
export async function getFeaturedProducts(limit = 4): Promise<Product[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("featured", true)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[catalogue] getFeaturedProducts failed:", error.message)
    return []
  }

  return toProducts(data)
}

/** A single product by slug, or `null` when the slug does not exist. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    console.error(`[catalogue] getProductBySlug("${slug}") failed:`, error.message)
    return null
  }

  return toProduct(data)
}

/** Other products in the same category, used as "You may also like". */
export async function getRelatedProducts(
  product: Product,
  limit = 4,
): Promise<Product[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("category.id", product.category.id)
    .neq("id", product.id)
    .limit(limit)

  if (error) {
    console.error("[catalogue] getRelatedProducts failed:", error.message)
    return []
  }

  return toProducts(data)
}
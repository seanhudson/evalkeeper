/**
 * Renaming between Evalkeeper's model and column names and an app's own,
 * for the stores in index.ts. With no mapping every name is its own, so
 * the queries are exactly what they'd be without this layer.
 */

/** A row or query object, keyed by column. */
export type Row = Record<string, unknown>;

/**
 * Column names for one of Evalkeeper's tables, keyed by Evalkeeper's field
 * name. A field left out keeps its own name. `null` says the app's table
 * has no such column: reads give null, and writing anything but null
 * fails, so a value is never silently lost. Only fields that may be null
 * can be left without a column.
 */
export type ColumnMap<R> = {
  [K in keyof R]?: null extends R[K] ? string | null : string;
};

/** The model methods the stores call, as any Prisma client has them. */
export type RawDelegate = {
  findMany(args: object): PromiseLike<unknown>;
  findFirst(args: object): PromiseLike<unknown>;
  findUnique(args: object): PromiseLike<unknown>;
  create(args: object): PromiseLike<unknown>;
  update(args: object): PromiseLike<unknown>;
  updateMany(args: object): PromiseLike<unknown>;
};

const METHODS = [
  "findMany",
  "findFirst",
  "findUnique",
  "create",
  "update",
  "updateMany",
] as const;

function isDelegate(d: unknown): d is RawDelegate {
  if (typeof d !== "object" || d === null) return false;
  return METHODS.every((m) => typeof Reflect.get(d, m) === "function");
}

/** Whether a value read from Prisma is a row (a plain object). */
export function isRow(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A Prisma Decimal (or any number-like object with `toNumber`) as a
 * number. Evalkeeper keeps money as plain numbers; an app's Decimal
 * columns read the same.
 */
function plain(v: unknown): unknown {
  if (typeof v !== "object" || v === null || v instanceof Date) return v;
  const toNumber: unknown = Reflect.get(v, "toNumber");
  return typeof toNumber === "function" ? Number(toNumber.call(v)) : v;
}

/**
 * One of Evalkeeper's tables on an app's model: the delegate, and the
 * renames both ways.
 */
export class Table {
  private readonly toColumn: Map<string, string | null>;
  private readonly columns: Set<string>;

  /**
   * @param table - Evalkeeper's name for the table, for error messages.
   * @param model - The Prisma client's delegate name for it.
   * @param fields - The renamed and missing columns.
   */
  constructor(
    readonly table: string,
    readonly model: string,
    fields: Readonly<Record<string, string | null | undefined>> = {},
  ) {
    this.toColumn = new Map();
    for (const [field, column] of Object.entries(fields))
      if (column !== undefined) this.toColumn.set(field, column);
    this.columns = new Set(
      [...this.toColumn.values()].filter((c): c is string => c !== null),
    );
  }

  /** The delegate for this table on a client or transaction. */
  on(db: object): RawDelegate {
    const d: unknown = Reflect.get(db, this.model);
    if (!isDelegate(d))
      throw new Error(
        `Your Prisma client has no model "${this.model}" for Evalkeeper's ${this.table} table: check the mapping's models.`,
      );
    return d;
  }

  /** The column a field is stored in; null when the table has none. */
  col(field: string): string | null {
    const c = this.toColumn.get(field);
    return c === undefined ? field : c;
  }

  /**
   * An object keyed by fields (data to write, a where, an orderBy, a
   * select), keyed by columns instead. Values are left as they are.
   */
  out(obj: Row): Row {
    const res: Row = {};
    for (const [field, value] of Object.entries(obj)) {
      const c = this.col(field);
      if (c !== null) res[c] = value;
      else if (value !== null && value !== undefined)
        throw new Error(
          `Evalkeeper's ${this.table}.${field} has no column in your table (the mapping sets it to null), so it can't keep ${JSON.stringify(value)}. Add a nullable column and map ${field} to it.`,
        );
    }
    return res;
  }

  /** Field names in a `distinct` list, as columns. */
  names(fields: string[]): string[] {
    return fields.map((f) => this.col(f)).filter((c): c is string => !!c);
  }

  /**
   * A row as read, keyed by Evalkeeper's fields: renamed columns back,
   * missing ones null, Decimals as numbers. Anything that isn't a row is
   * an error in the client, not data.
   */
  in(raw: unknown): Row {
    if (!isRow(raw))
      throw new Error(`Expected a ${this.table} row from Prisma`);
    const res: Row = {};
    for (const [column, value] of Object.entries(raw))
      if (!this.columns.has(column)) res[column] = plain(value);
    for (const [field, column] of this.toColumn)
      res[field] = column === null ? null : plain(raw[column]);
    return res;
  }

  /** Several rows as read. */
  ins(raw: unknown): Row[] {
    if (!Array.isArray(raw))
      throw new Error(`Expected a list of ${this.table} rows from Prisma`);
    return raw.map((r) => this.in(r));
  }
}

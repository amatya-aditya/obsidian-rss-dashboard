declare module "sql.js" {
    export interface SqlJsStatic {
        Database: new (data?: ArrayLike<number>) => Database;
    }

    export interface Database {
        run(sql: string, params?: unknown[]): Database;
        exec(sql: string, params?: unknown[]): QueryExecResult[];
        export(): Uint8Array;
        close(): void;
    }

    export interface QueryExecResult {
        columns: string[];
        values: SqlValue[][];
    }

    export type SqlValue = string | number | Uint8Array | null;

    interface InitSqlJsOptions {
        wasmBinary?: ArrayBuffer;
        locateFile?: (file: string) => string;
    }

    export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}

declare module "*.wasm" {
    const content: Uint8Array;
    export default content;
}

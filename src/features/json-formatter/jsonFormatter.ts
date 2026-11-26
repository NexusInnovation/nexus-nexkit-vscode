import JSON5 = require("json5");

export interface JsonFormatError {
  message: string;
  line: number;
  column: number;
}

export type JsonFormatResult = { formattedJson: string } | { error: JsonFormatError };

interface Json5SyntaxError extends SyntaxError {
  lineNumber?: number;
  columnNumber?: number;
}

export function formatJson(input: string): JsonFormatResult {
  try {
    const value = JSON5.parse(input);
    const formattedJson = JSON.stringify(value, null, 2);

    if (formattedJson === undefined) {
      return {
        error: {
          message: "The input does not represent a JSON value.",
          line: 1,
          column: 1,
        },
      };
    }

    return { formattedJson };
  } catch (error) {
    const parseError = error as Json5SyntaxError;
    return {
      error: {
        message: parseError.message,
        line: parseError.lineNumber ?? 1,
        column: (parseError.columnNumber ?? 0) + 1,
      },
    };
  }
}
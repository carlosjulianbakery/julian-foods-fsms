/**
 * Input formatter utilities.
 * Use these on onChange handlers where the stored/displayed value must be
 * auto-uppercased for traceability and auditing consistency.
 *
 * NOTE: Apply .toUpperCase() to the string value, NOT as CSS text-transform.
 * CSS would display uppercase but store the original case in the database.
 */

export const toUpperCaseInput = (value: string): string => value.toUpperCase();

/**
 * Hands a just-added person back to the form that opened Add person to pick
 * someone (the expense form's "New person"). Add person runs as its own
 * screen, so the id can't come back as a return value: the screen puts it
 * here on save and the form takes it when it regains focus. Cancelling
 * leaves nothing, so the form keeps whatever was selected.
 */

let pending: string | null = null;

export const newPersonHandoff = {
  put(personId: string) {
    pending = personId;
  },
  /** Returns the waiting id (if any) and clears it. */
  take(): string | null {
    const id = pending;
    pending = null;
    return id;
  },
};

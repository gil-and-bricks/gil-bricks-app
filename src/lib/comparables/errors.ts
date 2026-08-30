export type ComparablesErrorKind = 'OutsideEnglandWales' | 'UnknownPostcode' | 'BadInput';

export class ComparablesError extends Error {
  readonly kind: ComparablesErrorKind;

  constructor(kind: ComparablesErrorKind, message: string) {
    super(message);
    this.name = `ComparablesError:${kind}`;
    this.kind = kind;
  }
}

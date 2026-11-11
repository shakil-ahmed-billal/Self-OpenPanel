export type EmailTemplate =
  | 'reset-password'
  | 'invite'
  | 'notification-rule'
  | 'weekly-digest'
  | 'tracking-no-data'
  | 'tracking-data-stopped'
  | 'usage-limit-exceeded'
  | 'usage-near-limit';

export type EmailData<_T extends EmailTemplate = EmailTemplate> = object;

export async function sendEmail<T extends EmailTemplate>(
  _templateKey: T,
  _options: {
    to: string;
    data: EmailData<T>;
  }
): Promise<null> {
  return null;
}

import {
  type ChatLimitError,
  zChatLimitError,
} from '@openpanel/core/modules/assistant/assistant.constants';
import { GaugeIcon } from 'lucide-react';

/** The chat route answers a refused turn with a JSON body; the transport surfaces it as the error text. */
export function parseChatLimit(
  error: Error | undefined
): ChatLimitError | null {
  if (!error) {
    return null;
  }
  const body =
    'responseBody' in error && typeof error.responseBody === 'string'
      ? error.responseBody
      : error.message;
  try {
    const parsed = zChatLimitError.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function ChatLimitNotice({ limit }: { limit: ChatLimitError }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <GaugeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <span>{limit.message}</span>
      </div>
    </div>
  );
}

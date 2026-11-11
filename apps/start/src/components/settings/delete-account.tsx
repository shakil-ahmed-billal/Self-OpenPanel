import { TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { pushModal } from '@/modals';

export default function DeleteAccount() {
  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead>
        <span className="title">Delete account</span>
      </WidgetHead>
      <WidgetBody className="space-y-4">
        <p>
          Deleting your account will permanently remove your personal data.
          Organizations you created that have no other admin will also be
          deleted, along with their projects and events.
        </p>
        <div className="flex justify-start gap-4">
          <Button
            icon={TrashIcon}
            onClick={() => {
              pushModal('ConfirmDeleteAccount');
            }}
            variant="destructive"
          >
            Delete account
          </Button>
        </div>
      </WidgetBody>
    </Widget>
  );
}

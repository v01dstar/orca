// Fork: the sidebar's Remote Servers page, where Instabox machines are created, run and opened.
import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useMobilePageEscape } from '../mobile/use-mobile-page-escape'
import { InstaboxMachinesSection } from '../settings/instabox/InstaboxMachinesSection'
import { Button } from '../ui/button'

const NS = 'auto.components.instabox.InstaboxPage'

export default function InstaboxPage(): React.JSX.Element {
  const closeInstaboxPage = useAppStore((s) => s.closeInstaboxPage)
  useMobilePageEscape(closeInstaboxPage)
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground scrollbar-sleek">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold">{translate(`${NS}.title`, 'Remote Servers')}</h1>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={closeInstaboxPage}
            aria-label={translate(`${NS}.close`, 'Close Remote Servers')}
            title={translate(`${NS}.closeHint`, 'Close · Esc')}
          >
            <X />
          </Button>
        </header>
        <InstaboxMachinesSection active />
      </div>
    </main>
  )
}

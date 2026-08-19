import { useAppStore } from '../store'

export default function PermissionDialog() {
  const { permissionRequest, respondPermission } = useAppStore()

  if (!permissionRequest) return null

  const { toolName, args } = permissionRequest

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-bg-panel border border-border rounded-xl shadow-2xl max-w-md w-full mx-4 p-5">
        <h3 className="text-sm font-bold text-text-primary mb-3">Permission Request</h3>
        <p className="text-sm text-text-secondary mb-4">
          The agent wants to execute a tool that may modify your system:
        </p>

        <div className="bg-bg-card rounded-lg p-3 mb-4 border border-border">
          <p className="font-mono text-accent-glow text-sm mb-2">{toolName}</p>
          <pre className="text-xs text-text-muted overflow-x-auto whitespace-pre-wrap max-h-32">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => respondPermission(true)}
            className="btn-primary flex-1"
          >
            Allow
          </button>
          <button
            onClick={() => respondPermission(false)}
            className="btn-danger flex-1"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}

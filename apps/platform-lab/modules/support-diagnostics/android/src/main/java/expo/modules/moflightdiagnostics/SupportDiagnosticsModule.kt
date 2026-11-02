package expo.modules.moflightdiagnostics

import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Android-only process-exit bridge. It returns fixed categories, never system descriptions. */
class SupportDiagnosticsModule : Module() {
  private var testReceiver: SyntheticExitTestReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("MoFlightSupportDiagnostics")

    AsyncFunction("processExitAsync") { previousMarker: String?, currentMarker: String, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (
        Build.VERSION.SDK_INT < Build.VERSION_CODES.R ||
        context == null ||
        !ProcessExitHistory.isMarker(currentMarker) ||
        (previousMarker != null && !ProcessExitHistory.isMarker(previousMarker))
      ) {
        promise.resolve(mapOf("category" to "unknown", "registered" to false))
      } else {
        // The test receiver exists only on the exact synthetic lab AVD and uses a
        // fixed action plus a closed trigger allowlist.
        try {
          if (testReceiver == null) {
            testReceiver = SyntheticExitTestReceiver(context).also { it.registerIfEligible() }
          }
        } catch (_: Exception) {
          testReceiver = null
        }

        val category = if (previousMarker == null) {
          "unknown"
        } else {
          try {
            ProcessExitHistory.readCategory(context, previousMarker)
          } catch (_: Exception) {
            "unknown"
          }
        }
        val registered = try {
          ProcessExitHistory.registerCurrentMarker(context, currentMarker)
        } catch (_: Exception) {
          false
        }
        promise.resolve(mapOf("category" to category, "registered" to registered))
      }
    }.runOnQueue(Queues.DEFAULT)

    OnDestroy {
      testReceiver?.unregister()
      testReceiver = null
    }
  }
}

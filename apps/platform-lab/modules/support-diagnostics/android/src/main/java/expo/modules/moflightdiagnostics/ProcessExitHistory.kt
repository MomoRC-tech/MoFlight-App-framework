package expo.modules.moflightdiagnostics

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build

/** Bounded, marker-matched projection of the system's own-package exit ring buffer. */
internal object ProcessExitHistory {
  private const val MARKER_PREFIX = "moflight-exit-v1:"
  private const val HISTORY_LIMIT = 16
  private val markerPattern = Regex("^[0-9a-f]{32}$")

  fun isMarker(value: String): Boolean = markerPattern.matches(value)

  fun readCategory(context: Context, previousMarker: String): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || !isMarker(previousMarker)) return "unknown"
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return "unknown"
    val expected = summary(previousMarker)
    val matches = manager.getHistoricalProcessExitReasons(context.packageName, 0, HISTORY_LIMIT)
      .filter { it.getProcessStateSummary()?.contentEquals(expected) == true }
    if (matches.size != 1) return "unknown"
    return category(matches.single().reason)
  }

  fun registerCurrentMarker(context: Context, currentMarker: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || !isMarker(currentMarker)) return false
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
    manager.setProcessStateSummary(summary(currentMarker))
    return true
  }

  private fun summary(marker: String): ByteArray = "$MARKER_PREFIX$marker".toByteArray(Charsets.US_ASCII)

  private fun category(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "native-crash"
    ApplicationExitInfo.REASON_ANR -> "anr"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "low-memory"
    ApplicationExitInfo.REASON_UNKNOWN -> "unknown"
    ApplicationExitInfo.REASON_EXIT_SELF,
    ApplicationExitInfo.REASON_SIGNALED,
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE,
    ApplicationExitInfo.REASON_PERMISSION_CHANGE,
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE,
    ApplicationExitInfo.REASON_USER_REQUESTED,
    ApplicationExitInfo.REASON_USER_STOPPED,
    ApplicationExitInfo.REASON_DEPENDENCY_DIED,
    ApplicationExitInfo.REASON_OTHER,
    ApplicationExitInfo.REASON_FREEZER,
    ApplicationExitInfo.REASON_PACKAGE_STATE_CHANGE,
    ApplicationExitInfo.REASON_PACKAGE_UPDATED -> "other"
    else -> "unknown"
  }
}

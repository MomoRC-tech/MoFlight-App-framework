package expo.modules.moflightdiagnostics

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.system.Os
import android.system.OsConstants
import android.util.Log

/** Test-only process triggers, dynamically registered on the named synthetic lab AVD. */
internal class SyntheticExitTestReceiver(private val context: Context) {
  private var registered = false

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val appContext = context?.applicationContext ?: return
      if (intent?.action != ACTION || !isSyntheticLab(appContext)) return
      when (intent.getStringExtra(EXTRA_TRIGGER)) {
        TRIGGER_UNAVAILABLE -> {
          val missing = try { ProcessExitHistory.readCategory(appContext, "0".repeat(32)) } catch (_: Exception) { "unknown" }
          val invalid = ProcessExitHistory.readCategory(appContext, "invalid")
          Log.i("MoFlightExitProof", "unavailable=$missing invalid=$invalid")
        }
        TRIGGER_JAVA_CRASH -> throw IllegalStateException("synthetic process-exit test")
        TRIGGER_NATIVE_CRASH -> try {
          // The PID is used only to signal this app's own synthetic test process.
          Os.kill(Process.myPid(), OsConstants.SIGABRT)
        } catch (_: Exception) {
          // Do not fall back to a Java crash and mislabel the native-crash trial.
        }
        TRIGGER_SELF_EXIT -> kotlin.system.exitProcess(0)
        TRIGGER_ANR -> if ((intent.flags and Intent.FLAG_RECEIVER_FOREGROUND) != 0) {
          SystemClock.sleep(ANR_BLOCK_MILLISECONDS)
        }
      }
    }
  }

  @SuppressLint("UnspecifiedRegisterReceiverFlag")
  fun registerIfEligible() {
    if (registered || !isSyntheticLab(context)) return
    val filter = IntentFilter(ACTION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    registered = true
  }

  fun unregister() {
    if (!registered) return
    try {
      context.unregisterReceiver(receiver)
    } catch (_: IllegalArgumentException) {
      // The React context may already have unregistered its receivers.
    } finally {
      registered = false
    }
  }

  private fun isSyntheticLab(candidate: Context): Boolean {
    if (candidate.packageName != LAB_PACKAGE) return false
    return try {
      ProcessBuilder("/system/bin/getprop", "ro.boot.qemu.avd_name")
        .start().inputStream.bufferedReader().use { it.readText().trim() == SYNTHETIC_AVD }
    } catch (_: Exception) {
      false
    }
  }

  private companion object {
    const val ACTION = "de.momorc.moflight.lab.SUPPORT_DIAGNOSTIC_TEST"
    const val EXTRA_TRIGGER = "trigger"
    const val TRIGGER_JAVA_CRASH = "java-crash"
    const val TRIGGER_NATIVE_CRASH = "native-crash"
    const val TRIGGER_SELF_EXIT = "self-exit"
    const val TRIGGER_ANR = "anr"
    const val TRIGGER_UNAVAILABLE = "unavailable-history"
    const val LAB_PACKAGE = "de.momorc.moflight.lab"
    const val SYNTHETIC_AVD = "MoFlight_Synthetic_API37"
    // Foreground-priority broadcasts have a 10–20s timeout on Android 14+.
    // Stay bounded while exceeding that window; background-priority probes are refused.
    const val ANR_BLOCK_MILLISECONDS = 35_000L
  }
}

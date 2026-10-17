package expo.modules.moflightprovider

import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** App WebView store only. Never reads cookies, credentials or provider DOM. */
class ProviderSessionModule : Module() {
  private var running = false
  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("MoFlightProviderSession")
    AsyncFunction("clearAsync") { promise: Promise ->
      if (running) promise.reject("E_BUSY", "WebView store operation already active", null)
      else {
        running = true
        clearStore { empty ->
          running = false
          promise.resolve(mapOf("cookiesEmpty" to empty, "webStorageDeletionRequested" to true))
        }
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("syntheticProofAsync") { promise: Promise ->
      // A native, exact AVD guard prevents an accidental destructive proof on
      // the separate provider-session emulator or on a physical device.
      val avd = try {
        ProcessBuilder("/system/bin/getprop", "ro.boot.qemu.avd_name").start().inputStream.bufferedReader().use { it.readText().trim() }
      } catch (_: Exception) { "" }
      if (avd != "MoFlight_Synthetic_API37") promise.reject("E_SYNTHETIC_ONLY", "Dedicated synthetic emulator required", null)
      else if (running) promise.reject("E_BUSY", "WebView store operation already active", null)
      else { running = true; syntheticProof(promise) }
    }.runOnQueue(Queues.MAIN)
  }

  private fun clearStore(done: (Boolean) -> Unit) {
    val cookies = CookieManager.getInstance()
    cookies.removeAllCookies { _ ->
      // The callback boolean means 'any removed'; false is valid when empty.
      cookies.flush()
      WebStorage.getInstance().deleteAllData()
      done(!cookies.hasCookies())
    }
  }

  private fun syntheticProof(promise: Promise) {
    val activity = appContext.currentActivity
    if (activity == null) { running = false; promise.reject("E_ACTIVITY", "Activity unavailable", null); return }
    var view: WebView? = null
    var finished = false
    fun dispose() { view?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }; view = null }
    fun finish(ok: Boolean) {
      if (finished) return
      finished = true; dispose(); running = false
      promise.resolve(mapOf("passed" to ok, "cookie" to ok, "localStorage" to ok, "sessionStorage" to ok, "indexedDB" to ok, "documentRecreated" to ok))
    }
    val origin = "https://moflight.synthetic.invalid/"
    val key = "moflight-synthetic-proof"
    val watchdog = Runnable { finish(false) }
    main.postDelayed(watchdog, 20000)
    fun create(script: String, done: () -> Unit) {
      val next = WebView(activity)
      view = next
      next.settings.javaScriptEnabled = true
      next.settings.domStorageEnabled = true
      // Fixture is inline, network and navigation are never needed.
      next.settings.blockNetworkLoads = true
      next.webViewClient = object : WebViewClient() {
        override fun onPageFinished(web: WebView, url: String) {
          if (finished) return
          web.evaluateJavascript(script) { done() }
        }
      }
      activity.addContentView(next, ViewGroup.LayoutParams(1, 1))
      next.loadDataWithBaseURL(origin, "<html><body>Synthetic storage fixture</body></html>", "text/html", "UTF-8", null)
    }
    fun verify(attempt: Int) {
      if (finished) return
      view?.evaluateJavascript("window.proofReady === true && localStorage.getItem('$key') === null && sessionStorage.getItem('$key') === null && window.proofDatabaseEmpty === true") { result ->
        if (result == "true" && !CookieManager.getInstance().hasCookies()) {
          main.removeCallbacks(watchdog); finish(true)
        } else if (attempt < 50) main.postDelayed({ verify(attempt + 1) }, 100)
        else { main.removeCallbacks(watchdog); finish(false) }
      }
    }
    val seed = """
      localStorage.setItem('$key','sentinel'); sessionStorage.setItem('$key','sentinel');
      window.proofReady=false;
      var r=indexedDB.open('$key',1);
      r.onupgradeneeded=function(){r.result.createObjectStore('sentinels');};
      r.onsuccess=function(){var db=r.result;var t=db.transaction('sentinels','readwrite');t.objectStore('sentinels').put('sentinel','key');t.oncomplete=function(){db.close();window.proofReady=true;};};true;
    """.trimIndent()
    val read = """
      window.proofReady=false;window.proofDatabaseEmpty=false;
      var r=indexedDB.open('$key',1);
      r.onupgradeneeded=function(){r.result.createObjectStore('sentinels');};
      r.onsuccess=function(){var db=r.result;var t=db.transaction('sentinels','readonly');var q=t.objectStore('sentinels').get('key');q.onsuccess=function(){window.proofDatabaseEmpty=q.result===undefined;};t.oncomplete=function(){db.close();window.proofReady=true;};};true;
    """.trimIndent()
    fun seeded(attempt: Int) {
      if (finished) return
      view?.evaluateJavascript("window.proofReady===true && localStorage.getItem('$key')==='sentinel' && sessionStorage.getItem('$key')==='sentinel'") { result ->
        if (result != "true") {
          if (attempt < 50) main.postDelayed({ seeded(attempt + 1) }, 100) else finish(false)
        } else CookieManager.getInstance().setCookie(origin, "$key=sentinel; Secure; SameSite=Strict; Max-Age=3600") { accepted ->
          if (finished) return@setCookie
          if (!accepted || !CookieManager.getInstance().hasCookies()) finish(false)
          else { dispose(); clearStore { empty -> if (!empty) finish(false) else create(read) { verify(0) } } }
        }
      }
    }
    create(seed) { seeded(0) }
  }
}

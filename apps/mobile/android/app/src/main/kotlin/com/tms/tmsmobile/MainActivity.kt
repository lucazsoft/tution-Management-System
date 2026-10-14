package com.tms.tmsmobile

import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    private var startupOverlay: View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showStartupOverlay()
    }

    /**
     * Keeps a native loading indicator visible until Flutter renders its first
     * frame. This bridges the gap between Android's static launch screen and
     * the Flutter startup view on slower devices.
     */
    private fun showStartupOverlay() {
        val overlay = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
            isClickable = true
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        val loadingContent = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        loadingContent.addView(
            ImageView(this).apply {
                setImageResource(R.mipmap.ic_launcher)
                contentDescription = null
            },
            LinearLayout.LayoutParams(dp(88), dp(88)),
        )
        loadingContent.addView(
            ProgressBar(this, null, android.R.attr.progressBarStyleSmall).apply {
                isIndeterminate = true
                indeterminateTintList = ColorStateList.valueOf(Color.rgb(36, 87, 167))
            },
            LinearLayout.LayoutParams(dp(28), dp(28)).apply {
                topMargin = dp(24)
            },
        )
        loadingContent.addView(
            TextView(this).apply {
                text = "Loading..."
                textSize = 13f
                setTextColor(Color.rgb(100, 116, 139))
                gravity = Gravity.CENTER
            },
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = dp(12)
            },
        )
        overlay.addView(
            loadingContent,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER,
            ),
        )

        val brand = TextView(this).apply {
            text = "TMS\nTuition Management System"
            textSize = 13f
            setTextColor(Color.rgb(36, 87, 167))
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.2f)
        }
        overlay.addView(
            brand,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,
            ).apply {
                marginStart = dp(24)
                marginEnd = dp(24)
                bottomMargin = dp(38)
            },
        )

        startupOverlay = overlay
        addContentView(
            overlay,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
    }

    override fun onFlutterUiDisplayed() {
        super.onFlutterUiDisplayed()
        startupOverlay?.let { overlay ->
            (overlay.parent as? ViewGroup)?.removeView(overlay)
        }
        startupOverlay = null
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}

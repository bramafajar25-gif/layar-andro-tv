# Proguard rules for Layar TV
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.layar.tv.** { *; }

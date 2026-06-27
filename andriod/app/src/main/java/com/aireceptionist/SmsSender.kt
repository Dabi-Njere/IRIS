package com.aireceptionist.sms

import android.content.Context
import android.telephony.SmsManager

object SmsSender {
    /** Returns true on apparent success. SmsManager doesn't confirm delivery
     * synchronously; for this personal app, "didn't throw" is treated as sent. */
    fun send(context: Context, phoneNumber: String, text: String): Boolean {
        return try {
            val smsManager = context.getSystemService(SmsManager::class.java)
            val parts = smsManager.divideMessage(text)
            smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
            true
        } catch (e: Exception) {
            false
        }
    }
}

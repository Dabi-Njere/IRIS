package com.aireceptionist.util

import android.content.Context
import android.net.Uri
import android.provider.ContactsContract

/**
 * Implements the "trust by contact" rule decided on for both SMS and
 * WhatsApp: unknown senders get the full rental-Q&A auto-pilot, saved
 * contacts always require approval regardless of what category the
 * message gets classified as.
 */
object TrustChecker {

    /**
     * SMS: a clean check — look up the actual phone number against the
     * device's saved contacts via PhoneLookup. Reliable, no ambiguity.
     */
    fun isTrustedSmsSender(context: Context, phoneNumber: String): Boolean {
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber))
        val cursor = context.contentResolver.query(
            uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null
        )
        return cursor?.use { it.moveToFirst() } ?: false
    }

    /**
     * WhatsApp: fuzzier. The notification only gives us a display name, not
     * the underlying number, so we can't do a clean PhoneLookup. A name that
     * happens to match a saved contact's display name is a reasonable signal,
     * but NOT proof — someone could set their WhatsApp profile name to match
     * a friend's name. Default to untrusted (i.e. safe/auto-pilot-eligible)
     * unless there's a real match, since being overly cautious here just
     * means a stranger gets the same treatment as a stranger, which is
     * correct; the actual risk is the reverse case (treating a real contact
     * as unknown), which this lookup avoids by checking saved contacts first.
     */
    fun isTrustedWhatsAppSender(context: Context, displayName: String): Boolean {
        // A bare phone number as the "name" means WhatsApp doesn't have a
        // contact match either — definitely not a saved contact.
        if (displayName.matches(Regex("^[+0-9 ()-]+$"))) return false

        val cursor = context.contentResolver.query(
            ContactsContract.Contacts.CONTENT_URI,
            arrayOf(ContactsContract.Contacts.DISPLAY_NAME),
            "${ContactsContract.Contacts.DISPLAY_NAME} = ?",
            arrayOf(displayName),
            null
        )
        return cursor?.use { it.moveToFirst() } ?: false
    }
}

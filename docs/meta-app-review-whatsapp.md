# Delywa WhatsApp App Review Recording Guide

## Scope

Delywa requests only the WhatsApp Business capabilities required to receive
customer messages, display conversations to the connected business, reply to
customers, and send order-related notifications. Do not request Facebook Login,
Pages, Instagram, advertising, publishing, or user photo permissions unless a
separate product feature is added and demonstrated.

## Test accounts and data

Use a Meta test Business Manager, a WhatsApp test business phone number, a
Delywa demo business, one demo business administrator, and one test customer
phone number. Use fictional names, addresses, orders, and messages only.
Provide the reviewer with the public Delywa URL and the test administrator
credentials through Meta's secure review fields, never in the video.

## Recording script (English)

### 1. Business login

Show the Delywa login page and sign in as the demo business administrator.
Open **WhatsApp Configuration** from the business panel.

On-screen annotation: `Business administrator is connecting a WhatsApp Business account.`

### 2. Permission grant and asset selection

Click **Continue with Meta**. Show the complete Meta authorization flow:
Meta login, the requested permissions, business selection, WhatsApp Business
Account selection, and phone number selection. Click **Allow/Continue**.

On-screen annotation: `The administrator grants access only to the selected WhatsApp Business asset.`

Return to Delywa and show **WhatsApp Business connected** and the selected
phone number ID. Do not show an access token.

### 3. Webhook and incoming data

From the test customer phone, send `Hello, I would like to place an order`.
Show the message arriving in Delywa's conversation inbox. Open the
conversation and show the customer phone number in the permitted business
context.

On-screen annotation: `Delywa receives the customer's WhatsApp message through the Meta webhook and stores it in the business conversation.`

### 4. Reply and order notification

Reply from Delywa with a normal customer-service message. Then complete a
demo order and show the order confirmation or status notification arriving on
the test customer phone.

On-screen annotation: `Delywa uses the authorized WhatsApp account to reply and send an order-related notification.`

If the message is outside WhatsApp's customer-care window, show the approved
template flow instead of attempting an unapproved free-form message.

### 5. Privacy and revocation

Open the public **Privacy Policy** and **Data Deletion** pages. Show what data
is stored, why it is used, how long conversations are retained, and how a
customer can request deletion. Optionally revoke the Meta connection from the
test Business Manager and show that Delywa no longer treats the account as
connected.

On-screen annotation: `The business can revoke access and customers can request deletion of their stored conversation data.`

## Permission-to-evidence matrix

| Requested capability | Recording evidence | Delywa result |
| --- | --- | --- |
| WhatsApp Business account connection | Meta authorization and asset selection | Connection status appears in Delywa |
| WhatsApp message access | Test customer sends a message | Message appears in the business inbox |
| WhatsApp message sending | Administrator replies from the inbox | Reply arrives on the test phone |
| Order-related messaging | Demo order is confirmed or updated | Customer receives the related notification |
| Data deletion callback/flow | Open deletion page and show request/status flow | Data deletion instructions and confirmation URL |

## Submission notes

- Record at 1080p or higher, with the app window maximized and the cursor
  visible. Meta reviewers do not need audio.
- Use zooms or annotations when text is small.
- Keep the recording focused on the exact feature under review.
- Include the test login steps and expected result in the App Review notes.
- Never include passwords, access tokens, app secrets, real customer data, or
  unrelated permissions in the recording.
# BSV Invoice App

Create and pay invoices with BSV.

A deployment of the master branch of this repository is at [fun-invoices.metanet.app](https://fun-invoices.metanet.app)

This is a [BRC-102](https://github.com/bitcoin-sv/BRCs/blob/master/apps/0102.md) structured project. Read the spec for details.


## Blueprint

Invoice is a message sent from one peer to the other

Invoices are encrypted
From: the payee
To: the payer

An invoice has:
- Custom logo / brand color
- Date
- Reference number
- Payee name / contact info
- Payer name / contact info
- Line items
- Taxes
- Total

Steps:
- Create an invoice
- Send invoice to peer
- Receive invoices
- Review invoice
- Pay invoice, including its hash in the transaction
- Receive payment notification
- Accept payment & issue receipt
- Receive receipt notification
- Download receipt PDF
- Download invoice PDF (paid or unpaid)



## License

[Open BSV License](./LICENSE.txt)

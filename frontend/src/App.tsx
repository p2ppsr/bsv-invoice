import React, { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'react-toastify'
import {
  AppBar, Toolbar, Dialog,
  DialogTitle, DialogContent, DialogContentText, DialogActions, TextField,
  Button, Fab, LinearProgress, Typography, IconButton, Grid, Divider, InputAdornment, Paper
} from '@mui/material'
import { styled } from '@mui/system'
import AddIcon from '@mui/icons-material/Add'
import GitHubIcon from '@mui/icons-material/GitHub'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import useAsyncEffect from 'use-async-effect'
import { NoMncModal, checkForMetaNetClient } from 'metanet-react-prompt'
import { WalletClient, Utils, Random } from '@bsv/sdk'
import './App.scss'
import { IdentitySearchField } from '@bsv/identity-react'
import { MessageBoxClient, PeerPayClient } from '@bsv/message-box-client'

const AppBarPlaceholder = styled('div')({
  height: '4em'
})

const AddMoreFab = styled(Fab)({
  position: 'fixed',
  right: '1em',
  bottom: '1em',
  zIndex: 10
})

const LoadingBar = styled(LinearProgress)({
  margin: '1em'
})

const GitHubIconStyle = styled(IconButton)({
  color: '#ffffff'
})

const LineItemRow = styled(Paper)(({ theme }) => ({
  padding: '12px',
  marginTop: '12px'
}))

const TotalsBar = styled('div')({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '1.5rem',
  marginTop: '1rem'
})

const walletClient = new WalletClient()
const messageBoxClient = new MessageBoxClient({
  walletClient,
  host: 'https://messagebox.babbage.systems'
})
const peerPayClient = new PeerPayClient({
  walletClient
})

type LineItem = {
  description: string;
  quantity: number;
  price: number; // per-unit price in your display currency
}

type Invoice = {
  date: number;
  id: string;
  title: string;
  payer: string;
  payee: string;
  lineItems: Array<LineItem>;
  totals: {
    subtotal: number;
    total: number;
  }
}

const PROTOCOL_ID = [1, 'basic invoicing'] as [1, string]

const INVOICE_BOX = 'incoming-invoices'

// Small helpers
const toMoney = (n: number) => {
  if (Number.isNaN(n) || !Number.isFinite(n)) return '0'
  return n.toFixed(0)
}

const App: React.FC = () => {
  // These are some state variables that control the app's interface.
  const [isMncMissing, setIsMncMissing] = useState<boolean>(false)
  const [createOpen, setCreateOpen] = useState<boolean>(false)
  const [createTitle, setCreateTitle] = useState<string>('')
  const [createPayer, setCreatePayer] = useState<string>('')
  const [createLineItems, setCreateLineItems] = useState<Array<LineItem>>([
    // Start with one blank row to make the UX obvious
    { description: '', quantity: 1, price: 0 }
  ])
  const [createLoading, setCreateLoading] = useState<boolean>(false)
  const [incomingInvoicesLoading, setIncomingInvoicesLoading] = useState<boolean>(true)
  const [incomingInvoices, setIncomingInvoices] = useState<Array<Invoice>>([])

  // Run a 1s interval for checking if MNC is running
  useAsyncEffect(() => {
    const intervalId = setInterval(() => {
      checkForMetaNetClient().then(hasMNC => {
        if (hasMNC === 0) {
          setIsMncMissing(true) // Open modal if MNC is not found
        } else {
          setIsMncMissing(false) // Ensure modal is closed if MNC is found
          clearInterval(intervalId)
        }
      }).catch(error => {
        console.error('Error checking for MetaNet Client:', error)
      })
    }, 1000)
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  const addLineItem = () => {
    setCreateLineItems(items => [...items, { description: '', quantity: 1, price: 0 }])
  }

  const removeLineItem = (index: number) => {
    setCreateLineItems(items => items.filter((_, i) => i !== index))
  }

  const updateLineItem = <K extends keyof LineItem>(index: number, key: K, value: LineItem[K]) => {
    setCreateLineItems(items => {
      const next = [...items]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const subtotal = createLineItems.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.price) || 0), 0)

  /**
   * Handle creation of a new invoice.
   * Encrypts the invoice content creates a PushDrop token locked for the payer.
   */
  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault() // Stop the HTML form from reloading the page.

    // Basic validation up front
    if (createTitle.trim() === '') {
      toast.error('Enter a title for the invoice')
      return
    }
    if (createPayer.trim() === '') {
      toast.error('Select the person who will pay the invoice')
      return
    }
    if (createLineItems.length === 0) {
      toast.error('Add at least one line item')
      return
    }
    const hasBadItem = createLineItems.some(li =>
      li.description.trim() === '' ||
      !Number.isFinite(Number(li.quantity)) || Number(li.quantity) <= 0 ||
      !Number.isFinite(Number(li.price)) || Number(li.price) < 0
    )
    if (hasBadItem) {
      toast.error('Fix line items: description required; quantity > 0; price ≥ 0')
      return
    }

    try {
      // Now, we start a loading bar before the encryption and heavy lifting.
      setCreateLoading(true)

      // Randomly generate a keyID for the invoice to avoid key re-use
      const keyID = Utils.toBase64(Random(16))

      // Prepare clean payload (coerce numbers)
      const normalizedItems = createLineItems.map(li => ({
        description: li.description.trim(),
        quantity: Number(li.quantity),
        price: Number(li.price)
      }))

      const encryptedInvoice = (await walletClient.encrypt({
        plaintext: Utils.toArray(JSON.stringify({
          payer: createPayer,
          title: createTitle.trim(),
          lineItems: normalizedItems,
          date: Date.now(),
          totals: {
            subtotal,
            total: subtotal
            // Taxes/fees/discounts can be added later; leaving simple for now
          }
        }), 'utf8'),
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: createPayer
      })).ciphertext

      const encryptedInvoiceWithKeyID = new Utils.Writer()
        .write(Utils.toArray(keyID, 'base64'))
        .write(encryptedInvoice)
        .toArray()

      await messageBoxClient.sendMessage({
        messageBox: INVOICE_BOX,
        recipient: createPayer,
        body: Utils.toBase64(encryptedInvoiceWithKeyID)
      })

      setCreateLoading(false)
      toast.dark('Invoice successfully created!')

      // Reset form
      setCreateTitle('')
      setCreatePayer('')
      setCreateLineItems([{ description: '', quantity: 1, price: 0 }])
      setCreateOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
      console.error(e)
      setCreateLoading(false)
    }
  }

  // Load inciming invoices when the page loads
  useAsyncEffect(async () => {
    if (isMncMissing === false && incomingInvoicesLoading === true) {
      const messages = await messageBoxClient.listMessages({
        messageBox: INVOICE_BOX
      })
      const invoices: Array<Invoice> = []
      for (const m of messages) {
        try {
          const invoiceReader = new Utils.Reader(Utils.toArray(m.body, 'base64'))
          const keyID = Utils.toBase64(invoiceReader.read(16))
          const encryptedInvoice = invoiceReader.read()
          const decryptedInvoice = await walletClient.decrypt({
            protocolID: PROTOCOL_ID,
            keyID,
            counterparty: m.sender,
            ciphertext: encryptedInvoice
          })
          const parsed = JSON.parse(Utils.toUTF8(decryptedInvoice.plaintext))
          invoices.push({
            ...parsed,
            id: m.messageId,
            payee: m.sender
          })
        } catch (e) {
          console.error('Failed to parse incoming invoice', e)
          await messageBoxClient.acknowledgeMessage({
            messageIds: [m.messageId]
          })
        }
      }
      setIncomingInvoices(invoices)
      setIncomingInvoicesLoading(false)
    }
  }, [isMncMissing, incomingInvoicesLoading])

  const payInvoice = async (index: number) => {
    const invoice: Invoice = incomingInvoices[index]
    await peerPayClient.sendPayment({
      recipient: invoice.payee,
      amount: invoice.totals.total,
      
    })
    await messageBoxClient.acknowledgeMessage({
      messageIds: [invoice.id]
    })
  }

  // The rest of this file just contains some UI code.
  // ----------------------------------------------------------------------
  return (
    <>
      <NoMncModal appName='Invoice App' open={isMncMissing} onClose={() => { setIsMncMissing(false) }} />
      <AppBar position='static'>
        <Toolbar>
          <Typography variant='h6' component='div' sx={{ flexGrow: 1 }}>
            BSV Invoice App!
          </Typography>
          <GitHubIconStyle onClick={() => window.open('https://github.com/p2ppsr/bsv-invoice', '_blank')}>
            <GitHubIcon />
          </GitHubIconStyle>
        </Toolbar>
      </AppBar>
      <AppBarPlaceholder />

      {incomingInvoicesLoading ? (
  <LinearProgress />
) : (
  incomingInvoices.map((inv: Invoice, i: number) => (
    <LineItemRow key={i} elevation={2}>
      <Typography variant="h6">{inv.title}</Typography>
      <Typography variant="body2" color="text.secondary">
        Date: {new Date(inv.date).toLocaleDateString()}
      </Typography>
      <Typography variant="body2">Payer: {inv.payer}</Typography>
      <Typography variant="body2">Payee: {inv.payee}</Typography>

      <Divider sx={{ my: 1 }} />

      {inv.lineItems.map((li, j) => (
        <Grid container spacing={2} key={j} sx={{ mb: 1 }}>
          <Grid item xs={6}>
            <Typography>{li.description}</Typography>
          </Grid>
          <Grid item xs={2}>
            <Typography>Qty: {li.quantity}</Typography>
          </Grid>
          <Grid item xs={2}>
            <Typography>Price: ${toMoney(li.price)}</Typography>
          </Grid>
          <Grid item xs={2}>
            <Typography>Total: ${toMoney(li.quantity * li.price)}</Typography>
          </Grid>
        </Grid>
      ))}

      <TotalsBar>
        <Typography variant="subtitle1">
          Subtotal: ${toMoney(inv.lineItems.reduce((sum, li) => sum + li.quantity * li.price, 0))}
        </Typography>
      </TotalsBar>
    </LineItemRow>
  ))
)}

      <AddMoreFab color='primary' onClick={() => { setCreateOpen(true) }}>
        <AddIcon />
      </AddMoreFab>

      <Dialog open={createOpen} onClose={() => { setCreateOpen(false) }} fullWidth maxWidth='md'>
        <form onSubmit={handleCreateSubmit}>
          <DialogTitle>Create New Invoice</DialogTitle>
          <DialogContent>
            <DialogContentText paragraph>
              Give your invoice a title
            </DialogContentText>
            <TextField
              fullWidth autoFocus
              label='Invoice Title'
              onChange={(e) => { setCreateTitle(e.target.value) }}
              value={createTitle}
            />
            <br /><br />
            <IdentitySearchField
              onIdentitySelected={(x) => {
                setCreatePayer(x.identityKey)
              }}
              appName='Invoice App'
            />

            <Divider sx={{ mt: 3, mb: 2 }} />

            <Typography variant='h6'>Line Items</Typography>
            <Typography variant='body2' color='text.secondary'>
              Add what you’re billing for. Quantity must be &gt; 0; price is per unit.
            </Typography>

            {createLineItems.map((li, idx) => {
              const lineTotal = (Number(li.quantity) || 0) * (Number(li.price) || 0)
              return (
                <LineItemRow elevation={1} key={idx}>
                  <Grid container spacing={2} alignItems='center'>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label='Description'
                        value={li.description}
                        onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                        placeholder='e.g., Consulting hours'
                      />
                    </Grid>
                    <Grid item xs={6} md={2.5}>
                      <TextField
                        fullWidth
                        type='number'
                        label='Quantity'
                        inputProps={{ step: '1', min: '1' }}
                        value={li.quantity}
                        onChange={(e) => updateLineItem(idx, 'quantity', Math.max(0, Number(e.target.value)))}
                      />
                    </Grid>
                    <Grid item xs={6} md={2.5}>
                      <TextField
                        fullWidth
                        type='number'
                        label='Price'
                        inputProps={{ step: '0.01', min: '0' }}
                        value={li.price}
                        onChange={(e) => updateLineItem(idx, 'price', Math.max(0, Number(e.target.value)))}
                        InputProps={{
                          startAdornment: <InputAdornment position='start'>$</InputAdornment>
                        }}
                      />
                    </Grid>
                    <Grid item xs={8} md={0.5} sx={{ display: { xs: 'none', md: 'block' } }} />
                    <Grid item xs={12} md={1}>
                      <IconButton
                        aria-label='remove line'
                        onClick={() => removeLineItem(idx)}
                        disabled={createLineItems.length === 1}
                        title={createLineItems.length === 1 ? 'At least one line item is required' : 'Remove line'}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant='body2' color='text.secondary'>
                        Line total: ${toMoney(lineTotal)}
                      </Typography>
                    </Grid>
                  </Grid>
                </LineItemRow>
              )
            })}

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item>
                <Button startIcon={<AddCircleOutlineIcon />} onClick={addLineItem}>
                  Add line item
                </Button>
              </Grid>
              {createLineItems.length > 1 && (
                <Grid item>
                  <Button
                    startIcon={<RemoveCircleOutlineIcon />}
                    onClick={() => removeLineItem(createLineItems.length - 1)}
                  >
                    Remove last
                  </Button>
                </Grid>
              )}
            </Grid>

            <TotalsBar>
              <Typography variant='subtitle1'>Subtotal: ${toMoney(subtotal)}</Typography>
            </TotalsBar>
          </DialogContent>
          {createLoading
            ? (<LoadingBar />)
            : (
              <DialogActions>
                <Button onClick={() => { setCreateOpen(false) }}>Cancel</Button>
                <Button type='submit' variant='contained'>Create Invoice</Button>
              </DialogActions>
            )
          }
        </form>
      </Dialog>
    </>
  )
}

export default App

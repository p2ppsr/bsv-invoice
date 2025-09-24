import React, { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'react-toastify'
import {
  AppBar, Toolbar, List, ListItem, ListItemText, ListItemIcon, Checkbox, Dialog,
  DialogTitle, DialogContent, DialogContentText, DialogActions, TextField,
  Button, Fab, LinearProgress, Typography, IconButton, Grid
} from '@mui/material'
import { styled } from '@mui/system'
import AddIcon from '@mui/icons-material/Add'
import GitHubIcon from '@mui/icons-material/GitHub'
import useAsyncEffect from 'use-async-effect'
import { NoMncModal, checkForMetaNetClient } from 'metanet-react-prompt'
import { WalletClient, PushDrop, Utils, Transaction, LockingScript, type WalletOutput, WalletProtocol, Random } from '@bsv/sdk'
import './App.scss'
import { IdentitySearchField } from '@bsv/identity-react'

const AppBarPlaceholder = styled('div')({
  height: '4em'
})

const NoItems = styled(Grid)({
  margin: 'auto',
  textAlign: 'center',
  marginTop: '5em'
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

const walletClient = new WalletClient()

type LineItem = {
  description: string;
  quantity: number;
  price: number;
}

const PROTOCOL_ID = [1, 'basic invoicing'] as [1, string]

const App: React.FC = () => {
  // These are some state variables that control the app's interface.
  const [isMncMissing, setIsMncMissing] = useState<boolean>(false)
  const [createOpen, setCreateOpen] = useState<boolean>(false)
  const [createTitle, setCreateTitle] = useState<string>('')
  const [createPayer, setCreatePayer] = useState<string>('')
  const [createLineItems, setCreateLineItems] = useState<Array<LineItem>>([])
  const [createLoading, setCreateLoading] = useState<boolean>(false)

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

  /**
   * Handle creation of a new invoice.
   * Encrypts the invoice content creates a PushDrop token locked for the payer.
   */
  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault() // Stop the HTML form from reloading the page.
    try {
      if (createTitle === '') {
        toast.error('Enter a title for the invoice')
        return
      }
      if (createPayer === '') {
        toast.error('Select the person who will pay the invoice')
        return
      }
      // Now, we start a loading bar before the encryption and heavy lifting.
      setCreateLoading(true)

      // Randomly generate a keyID for the invoice to avoid key re-use
      const keyID = Utils.toBase64(Random(16))

      // We can take the user's input from the text fields (their new invoice), and
      // encrypt it with a key that only they and the payer have. When we put the encrypted
      // value into a token, only the two parties invoivd can get it back.
      const encryptedInvoice = (await walletClient.encrypt({
        // The plaintext for encryption is what the user put into the text fields.
        // encrypt() expects an array of numbers. The BSV provides toArray(), a utility function that creates a number array from a string.
        plaintext: Utils.toArray(JSON.stringify({ // JSON stringified invoice object
          payer: createPayer,
          title: createTitle,
          lineItems: createLineItems
        }), 'utf8'),
        // The protocolID and keyID are important. When users encrypt things, they can do so in different contexts. 
        // The protocolID is the "context" in which a user has encrypted something. When your app uses a new protocol, it can only do so with the permission of the user.
        protocolID: PROTOCOL_ID,
        // The keyID can be used to enable multiple keys for different
        // operations within the same protocol.
        keyID,
        // We'll need to use the exact same protocolID and keyID later,
        // when we want to decrypt the invoice. Otherwise, the decryption would fail.

        // The counterparty is the person who can also decrypt later.
        counterparty: createPayer
      })).ciphertext

      console.log('Created an encrypted invoice', encryptedInvoice)

      setCreateLoading(false)
      // Now, we just let the user know the good news! Their invoice has been
      // created, and sent to the payer.
      toast.dark('Invoice successfully created!')

      setCreateTitle('')
      setCreateOpen(false)
    } catch (e) {
      // Any errors are shown on the screen and printed in the developer console
      toast.error((e as Error).message)
      console.error(e)
      setCreateLoading(false)
    }
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

      <AddMoreFab color='primary' onClick={() => { setCreateOpen(true) }}>
        <AddIcon />
      </AddMoreFab>

      <Dialog open={createOpen} onClose={() => { setCreateOpen(false) }}>
        <form onSubmit={handleCreateSubmit}>
          <DialogTitle>Create New Invoice</DialogTitle>
          <DialogContent>
            <DialogContentText paragraph>
              Give your invoice a title
            </DialogContentText>
            <TextField
              fullWidth autoFocus
              label='Invoice Title'
              onChange={(e: { target: { value: React.SetStateAction<string> } }) => { setCreateTitle(e.target.value) }}
              value={createTitle}
            />
            <br /><br />
            <IdentitySearchField
              onIdentitySelected={(x) => {
                setCreatePayer(x.identityKey)
              }}
              appName='Invoice App'
            />
          </DialogContent>
          {createLoading
            ? (<LoadingBar />)
            : (
              <DialogActions>
                <Button onClick={() => { setCreateOpen(false) }}>Cancel</Button>
                <Button type='submit'>OK</Button>
              </DialogActions>
            )
          }
        </form>
      </Dialog>
    </>
  )
}

export default App

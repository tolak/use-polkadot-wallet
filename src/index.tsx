import * as React from 'react'
import type { ReactNode } from 'react'
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'

import { ApiPromise, WsProvider} from '@polkadot/api';

import { pollEvery } from './utils'

const UseWalletContext = React.createContext<WalletContext>(null)

type Account = String
type Balance = String
type ParaId = Number
type Status = 'connected' | 'disconnected' | 'connecting' | 'error'

type Wallet = {
	defaultAccount: String
	accounts: String[]
	chainId: Number
	connector: Object
	error: Error | null
	getBlockNumber?: () => Number | null
	networkName: String
	reset: () => void
	status: Status
}

type WalletContext = {
	addBlockNumberListener: (callback: (blockNumber: Number) => void) => void
	removeBlockNumberListener: (callback: (blockNumber: Number) => void) => void
	pollBalanceInterval: Number
	pollBlockNumberInterval: Number,
	wallet: Wallet
} | null

type useWalletProviderProps = {
	chainId: Number
	children: ReactNode
	pollBalanceInterval: Number
	pollBlockNumberInterval: Number
	wsURL: String
	customTypes: Object
}

function usePolkadotWallet(): Wallet {
	const walletContext = useContext(UseWalletContext)

	if (walletContext === null) {
		throw new Error(
			'usePolkadotWallet() can only be used inside of <UsePolkadotWalletProvider />, ' + 
			'please declare it at a higher level.'
		)
	}

	const getBlockNumber = useGetBlockNumber()

	const { wallet }  = walletContext

	return useMemo(() => {
		return { ...wallet, getBlockNumber}
	}, [getBlockNumber, wallet])
}

function useGetBlockNumber(): () => Number | null {
	const walletContext = useContext(UseWalletContext)
	const [blockNumber, setBlockNumber] = useState<Number | null>(null)
	const requestedBlockNumber = useRef<Boolean>(false)

	const getBlockNumber = useCallback<() => Number | null>(() => {
		if (walletContext === null) {
			return null
		}

		requestedBlockNumber.current = true
		walletContext.addBlockNumberListener(setBlockNumber)

		return blockNumber
	}, [walletContext, blockNumber])

	useEffect(() => {
		if (!requestedBlockNumber.current || walletContext === null) {
			return
		}

		walletContext.addBlockNumberListener(setBlockNumber)

		return () => {
			walletContext.removeBlockNumberListener(setBlockNumber)
		}
	}, [requestedBlockNumber, walletContext])

	return getBlockNumber
}

function useWatchBlockNumber({
	polkadot,
	pollBlockNumberInterval,
}: {
	polkadot: ApiPromise
	pollBlockNumberInterval: Number
}) {
	const lastBlockNumber = useRef<Number | null>(null)

	const blockNumberListeners = useRef<Set<(blockNumber: Number) => void>>(
		new Set()
	)

	const addBlockNumberListener = useCallback((cb) => {
		if (blockNumberListeners.current.has(cb)) {
			return
		}

		cb(lastBlockNumber.current)

		blockNumberListeners.current.add(cb)
	}, [])

	const removeBlockNumberListener = useCallback((cb) => {
		blockNumberListeners.current.delete(cb)
	}, [])

	const updateBlockNumber = useCallback((blockNumber) => {
		if (lastBlockNumber.current === blockNumber) {
			return
		}

		lastBlockNumber.current = blockNumber
		blockNumberListeners.current.forEach((cb) => cb(blockNumber))
	}, [])

	useEffect(() => {
		if (!polkadot) {
			updateBlockNumber(null)
			return
		}

		let cancel = false

		const pollBlockNumber = pollEvery(() => {
			return {
				request: () => getBlockNumber(polkadot),
				onResult: (lastBlockNumber: Number) => {
					if (!cancel) {
						updateBlockNumber(
							lastBlockNumber === null
							? null 
							: JSBI.BigInt(lastBlockNumber).toString()
						)
					}
				},
			}
		}, pollBlockNumberInterval)

		const stopPollingBlockNumber = pollBlockNumber()

		return () => {
			cancel = true
			stopPollingBlockNumber()
		}
	}, [polkadot, pollBlockNumberInterval, updateBlockNumber])

	return { addBlockNumberListener, removeBlockNumberListener }
}

function UsePolkadotWalletProvider({
	chainId,
	children,
	pollBalanceInterval,
	pollBlockNumberInterval,
	wsURL,
	customTypes,
}: useWalletProviderProps) {
	const walletContext = useContext(UseWalletContext)

	if (walletContext !== null) {
		throw new Error('<UsePolkadotWalletProvider /> has already been declared.')
	}

	const [connector, setConnector] = useState<String | null>(null)
	const [error, setError] = useState<Error | null>(null)
	const [status, setStatus] = useState<Status>('disconnected')
	const activationId = useRef<Number>(0)
	const {
		addBlockNumberListener,
		removeBlockNumberListener,
	} = useWatchBlockNumber({ polkadot, pollBlockNumberInterval })

	const reset = useCallback(() => {

	}, [])

	const connect = useCallback(() => {
		reset()

		setStatus('connecting')

		try {
			const provider = new WsProvider(wsURL)
			const api = new ApiPromise({ provider, customTypes })
			await api.isReady
		} catch (error) {
			setStatus('error')
			setError(new Error('Failed to init polkadot api: ' + error) )
			return
		}

		setStatus('connecting')


	}, [wsURL, reset])

	useEffect(() => {
		// TODO: awake polkadot.js extension if it is not active

		let cancel = false

		return () => {
			cancel = true
			setStatus('disconnected')
		}
	}, [])

	const wallet = useMemo(
		() => ({
			defaultAccount,
			accounts,
			balance,
			chainId,
			connect,
			reset,
			status,
			error,
		}),[
			defaultAccount,
			accounts,
			balance,
			chainId,
			connect,
			reset,
			status,
			error
		]
	)

	return (
		<>{children}</>
	)
}

export {
	UsePolkadotWalletProvider,
	usePolkadotWallet,
}

export default usePolkadotWallet
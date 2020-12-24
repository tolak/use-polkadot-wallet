
export function pollEvery<R, T>(
    fn: (
      // As of TS 3.9, it doesn’t seem possible to specify dynamic params
      // as a generic type (e.g. using `T` here). Instead, we have to specify an
      // array in place (`T[]`), making it impossible to type params independently.
      ...params: T[]
    ) => {
      request: () => Promise<R>
      onResult: (result: R) => void
    },
    delay: number
  ) {
    let timer: any // can be TimeOut (Node) or number (web)
    let stop = false
    const poll = async (
      request: () => Promise<R>,
      onResult: (result: R) => void
    ) => {
      const result = await request()
      if (!stop) {
        onResult(result)
        timer = setTimeout(poll.bind(null, request, onResult), delay)
      }
    }
    return (...params: T[]) => {
      const { request, onResult } = fn(...params)
      stop = false
      poll(request, onResult)
      return () => {
        stop = true
        clearTimeout(timer)
      }
    }
  }

import { nanoid } from 'nanoid'

export function createDebug(debug: boolean) {
  return function (msg: string, type?: 'info' | 'error') {
    if (!debug)
      return
    switch (type) {
      case 'info':
        // eslint-disable-next-line no-console
        return console.info(msg)
      case 'error':

        return console.error(msg)
      default:
        // eslint-disable-next-line no-console
        return console.log(msg)
    }
  }
}
export function createId(str: string = nanoid(6)) {
  const timeStamp = Date.now().toString()
  return `${nanoid(6)}-${timeStamp.slice(timeStamp.length - 6, timeStamp.length)}-${nanoid(6)}-${str.slice(0, 6)}`
}

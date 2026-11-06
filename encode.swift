// Encodes a folder of transparent PNG frames to a ProRes 4444 .mov with alpha.
//
//   swift encode.swift <frames-dir> <out.mov> <fps>
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count == 4, let fps = Int32(args[3]) else {
    print("usage: swift encode.swift <frames-dir> <out.mov> <fps>"); exit(1)
}
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
guard let first = files.first,
      let src0 = CGImageSourceCreateWithURL(first as CFURL, nil),
      let img0 = CGImageSourceCreateImageAtIndex(src0, 0, nil) else { print("no frames"); exit(1) }
let width = img0.width, height = img0.height

try? FileManager.default.removeItem(at: out)
let writer = try AVAssetWriter(outputURL: out, fileType: .mov)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.proRes4444,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

for (i, file) in files.enumerated() {
    guard let src = CGImageSourceCreateWithURL(file as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("bad frame \(file.lastPathComponent)"); exit(1) }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
    guard let pb = buffer else { print("no buffer"); exit(1) }
    CVPixelBufferLockBaseAddress(pb, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.clear(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(pb, [])
    while !input.isReadyForMoreMediaData { usleep(1000) }
    adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { print("failed: \(String(describing: writer.error))"); exit(1) }
print("wrote \(out.lastPathComponent): \(files.count) frames, \(width)x\(height), \(fps) fps, ProRes 4444")

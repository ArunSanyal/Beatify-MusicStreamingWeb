import {NextResponse,NextRequest} from "next/server"
import S3 from "aws-sdk/clients/s3"
import { randomUUID } from "crypto"

const s3 = new S3({
  apiVersion:'2006-03-01',
  accessKeyId:process.env.NEXT_PUBLIC_ACCESS_KEY,
  secretAccessKey:process.env.NEXT_PUBLIC_SECRET_KEY,
  region:process.env.NEXT_PUBLIC_REGION,
  signatureVersion:'v4'
})
export async function GET(req:NextRequest,context:any) {
  const {params} = context;
  console.log(params.title)
  const Key = `${params.title}-${randomUUID()}.mp3`
  const s3Params = {
    Bucket:process.env.NEXT_PUBLIC_BUCKET_NAME,
    Key,
    Expires:60,
    ContentType:'audio/mp3'
  }
  const uploadUrl = await s3.getSignedUrl('putObject',s3Params)
   // Append user ID to the upload URL
   const uploadUrlWithUserId = `${uploadUrl}`;

  return NextResponse.json({
    uploadUrl:uploadUrlWithUserId,
    key:Key
  })
}
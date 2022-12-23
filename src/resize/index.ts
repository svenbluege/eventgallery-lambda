import {APIGatewayProxyEventV2, APIGatewayProxyResultV2} from 'aws-lambda';
import {resize} from "./resize";

export async function main(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {

    let settings = JSON.parse(event.body);
    console.log('settings 👉', settings);

    const resultETags = await resize(settings);

    return {
        statusCode: 200,
        body: JSON.stringify(resultETags, null, 2)
    };
}

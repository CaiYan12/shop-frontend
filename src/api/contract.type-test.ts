/**
 * 契约类型测试（编译期，无运行时断言）。
 *
 * 这个文件由 `pnpm type-check`（vue-tsc）编译：任何一条 `Expect<...>` 不成立，
 * 类型检查就会失败。它证明 `schema.d.ts` 与 `openapi-fetch` 消费端的类型
 * 与后端 OpenAPI 契约一致（D65 / V17），而不是「能生成就算数」。
 *
 * 覆盖范围：全部 20 个命名组件（列表 / 命中高亮 / 联想 / 详情 / 规格组合 / 推荐 / 分类 /
 * 购买校验 / 错误信封）与 6 个 operation 的请求、响应、错误响应类型。
 */
import type { components, operations } from './schema'
import type {
  ApiError,
  apiBaseUrl,
  checkPurchase,
  fetchProductList,
  getProduct,
  listRecommendations,
} from './client'
import type { describePurchaseResult } from './purchase-result'

/** 标准「类型相等」判定：双向条件类型，避免 any / never 的误判。 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type Schemas = components['schemas']
type ErrorResponse = Schemas['ErrorResponse']
type ProductCoverImage = Schemas['ProductCoverImage']
type ProductCategory = Schemas['ProductCategory']
type CategoryListItem = Schemas['CategoryListItem']
type CategoriesResponse = Schemas['CategoriesResponse']
type ProductListResponse = Schemas['ProductListResponse']
type ProductListItem = Schemas['ProductListItem']
type ProductSearchListItem = Schemas['ProductSearchListItem']
type ProductHighlight = Schemas['ProductHighlight']
type ProductSuggestionItem = Schemas['ProductSuggestionItem']
type ProductSuggestionHighlight = Schemas['ProductSuggestionHighlight']
type ProductSuggestionsResponse = Schemas['ProductSuggestionsResponse']
type ProductRecommendationsResponse = Schemas['ProductRecommendationsResponse']
type ProductDimension = Schemas['ProductDimension']
type ProductVariant = Schemas['ProductVariant']
type ProductDetailBlock = Schemas['ProductDetailBlock']
type ProductDetailResponse = Schemas['ProductDetailResponse']
type PurchaseCheckProduct = Schemas['PurchaseCheckProduct']
type PurchaseCheckVariant = Schemas['PurchaseCheckVariant']
type PurchaseCheckResponse = Schemas['PurchaseCheckResponse']

// —— 列表分页：page / pageSize / total / totalPages / items ——
export type _Page = Expect<Equal<ProductListResponse['page'], number>>
export type _PageSize = Expect<Equal<ProductListResponse['pageSize'], number>>
export type _Total = Expect<Equal<ProductListResponse['total'], number>>
export type _TotalPages = Expect<Equal<ProductListResponse['totalPages'], number>>
export type _Items = Expect<Equal<ProductListResponse['items'], ProductSearchListItem[]>>

// —— 列表项：金额是整数分（number），不是格式化字符串 ——
export type _DisplayPrice = Expect<Equal<ProductListItem['displayPriceCents'], number>>
export type _DisplayOriginalPrice = Expect<Equal<ProductListItem['displayOriginalPriceCents'], number>>
export type _SoldOut = Expect<Equal<ProductListItem['soldOut'], boolean>>
export type _Rating = Expect<Equal<ProductListItem['rating'], number>>
export type _Sales = Expect<Equal<ProductListItem['sales'], number>>
export type _ListItemCategory = Expect<Equal<ProductListItem['category'], ProductCategory>>
export type _ListItemCover = Expect<Equal<ProductListItem['coverImage'], ProductCoverImage>>

// —— 命中高亮（#23）：列表项覆盖 name / brand / model，片段是字符串数组 ——
export type _HighlightFields = Expect<Equal<keyof ProductHighlight, 'name' | 'brand' | 'model'>>
export type _HighlightFragments = Expect<Equal<ProductHighlight['name'], string[] | undefined>>
export type _ListHighlight = Expect<Equal<ProductSearchListItem['highlight'], ProductHighlight | undefined>>
export type _SearchListItemBase = Expect<
  Equal<Pick<ProductSearchListItem, keyof ProductListItem>, ProductListItem>
>

// —— 联想（#22、#23）：条目是 slug / name / brand，命中时额外带 name / brand 高亮 ——
export type _SuggestionItems = Expect<Equal<ProductSuggestionsResponse['items'], ProductSuggestionItem[]>>
export type _SuggestionBase = Expect<
  Equal<Pick<ProductSuggestionItem, 'slug' | 'name' | 'brand'>, { slug: string; name: string; brand: string }>
>
export type _SuggestionHighlight = Expect<
  Equal<ProductSuggestionItem['highlight'], ProductSuggestionHighlight | undefined>
>
export type _SuggestionHighlightFields = Expect<Equal<keyof ProductSuggestionHighlight, 'name' | 'brand'>>
export type _SuggestionFragments = Expect<Equal<ProductSuggestionHighlight['brand'], string[] | undefined>>
export type _SuggestionError = Expect<
  Equal<operations['listSuggestions']['responses'][503]['content']['application/json'], ErrorResponse>
>

// —— 图片 / 分类 / 推荐 / 分类列表 ——
export type _CoverImage = Expect<Equal<ProductCoverImage, { path: string; alt: string }>>
export type _Category = Expect<Equal<ProductCategory, { slug: string; name: string }>>
export type _CategoryListItem = Expect<Equal<CategoryListItem, { slug: string; name: string }>>
export type _CategoriesItems = Expect<Equal<CategoriesResponse['items'], CategoryListItem[]>>
export type _RecommendationItems = Expect<Equal<ProductRecommendationsResponse['items'], ProductListItem[]>>

// —— 详情响应：库存、图集、规格组合、详情块 ——
export type _DetailStock = Expect<Equal<ProductDetailResponse['stock'], number>>
export type _DetailImages = Expect<Equal<ProductDetailResponse['images'], ProductCoverImage[]>>
export type _DetailDimensions = Expect<Equal<ProductDetailResponse['dimensions'], ProductDimension[]>>
export type _DetailVariants = Expect<Equal<ProductDetailResponse['variants'], ProductVariant[]>>
export type _DetailBlocks = Expect<Equal<ProductDetailResponse['detail'], ProductDetailBlock[]>>
export type _DimensionOptions = Expect<Equal<ProductDimension['options'], string[]>>
export type _VariantSku = Expect<Equal<ProductVariant['sku'], string>>
export type _VariantPrice = Expect<Equal<ProductVariant['priceCents'], number>>
export type _VariantOriginalPrice = Expect<Equal<ProductVariant['originalPriceCents'], number>>
export type _VariantStock = Expect<Equal<ProductVariant['stock'], number>>

// —— 详情块是 text / image 二分支联合 ——
type TextBlock = Extract<ProductDetailBlock, { type: 'text' }>
type ImageBlock = Extract<ProductDetailBlock, { type: 'image' }>
export type _TextBlock = Expect<Equal<TextBlock, { type: 'text'; text: string }>>
export type _ImageBlock = Expect<Equal<ImageBlock, { type: 'image'; path: string; alt: string }>>

// —— 购买校验入参里的商品 / 规格摘要 ——
export type _CheckProduct = Expect<Equal<PurchaseCheckProduct, { slug: string; name: string }>>
export type _CheckVariant = Expect<
  Equal<PurchaseCheckVariant, { sku: string; option1Value: string; option2Value: string }>
>

// —— 购买校验三分支：result 两个取值，blocked 下按 reason 再分两支 ——
export type _ResultTags = Expect<Equal<PurchaseCheckResponse['result'], 'purchasable' | 'blocked'>>
type BlockedBranch = Extract<PurchaseCheckResponse, { result: 'blocked' }>
export type _ReasonTags = Expect<Equal<BlockedBranch['reason'], 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED'>>
type PriceChangedBranch = Extract<PurchaseCheckResponse, { reason: 'PRICE_CHANGED' }>
export type _RequestedPrice = Expect<Equal<PriceChangedBranch['requestedUnitPriceCents'], number>>
type PurchasableBranch = Extract<PurchaseCheckResponse, { result: 'purchasable' }>
export type _PurchasablePriceChanged = Expect<Equal<PurchasableBranch['priceChanged'], false>>

// —— 错误信封：七码枚举 + message + 可选 details ——
type ErrorEnvelope = ErrorResponse['error']
export type _ErrorCode = Expect<
  Equal<
    ErrorEnvelope['code'],
    | 'VALIDATION_FAILED'
    | 'PRODUCT_NOT_FOUND'
    | 'VARIANT_NOT_FOUND'
    | 'VARIANT_NOT_IN_PRODUCT'
    | 'SEARCH_NOT_AVAILABLE'
    | 'NOT_FOUND'
    | 'INTERNAL_ERROR'
  >
>
export type _ErrorMessage = Expect<Equal<ErrorEnvelope['message'], string>>
export type _ErrorDetails = Expect<
  Equal<ErrorEnvelope['details'], { path: string; message: string }[] | undefined>
>

// —— 5 个 operation 的请求参数 ——
type ListQuery = NonNullable<operations['listProducts']['parameters']['query']>
export type _ListArg = Expect<Equal<Parameters<typeof fetchProductList>[0], ListQuery>>
export type _ListSort = Expect<Equal<ListQuery['sort'], 'price_asc' | 'price_desc' | 'sales_desc' | undefined>>
export type _ListPage = Expect<Equal<ListQuery['page'], number | undefined>>
export type _ListKeyword = Expect<Equal<ListQuery['keyword'], string | undefined>>
export type _DetailPath = Expect<Equal<operations['getProduct']['parameters']['path'], { slug: string }>>
export type _RecommendationPath = Expect<
  Equal<operations['listRecommendations']['parameters']['path'], { slug: string }>
>
// —— 详情 / 推荐客户端入口（#17）：标识是字符串，可选中止信号 ——
export type _DetailArg = Expect<Equal<Parameters<typeof getProduct>[0], string>>
export type _DetailSignal = Expect<Equal<Parameters<typeof getProduct>[1], AbortSignal | undefined>>
export type _RecommendationArg = Expect<Equal<Parameters<typeof listRecommendations>[0], string>>
export type _RecommendationSignal = Expect<
  Equal<Parameters<typeof listRecommendations>[1], AbortSignal | undefined>
>
type PurchaseBody = operations['checkPurchase']['requestBody']['content']['application/json']
export type _PurchaseArg = Expect<Equal<Parameters<typeof checkPurchase>[0], PurchaseBody>>
export type _PurchaseBody = Expect<
  Equal<
    PurchaseBody,
    { slug: string; sku: string; quantity: number; expectedUnitPriceCents?: number }
  >
>

// —— 5 个 operation 的错误响应都指向同一个错误信封 ——
export type _ListError = Expect<
  Equal<operations['listProducts']['responses'][400]['content']['application/json'], ErrorResponse>
>
export type _DetailError = Expect<
  Equal<operations['getProduct']['responses'][404]['content']['application/json'], ErrorResponse>
>
export type _RecommendationError = Expect<
  Equal<
    operations['listRecommendations']['responses'][404]['content']['application/json'],
    ErrorResponse
  >
>
export type _CategoriesError = Expect<
  Equal<operations['listCategories']['responses'][500]['content']['application/json'], ErrorResponse>
>
export type _PurchaseError = Expect<
  Equal<operations['checkPurchase']['responses'][409]['content']['application/json'], ErrorResponse>
>

// —— 客户端按路径调用，返回类型来自 schema.d.ts ——
export type _ListReturn = Expect<Equal<Awaited<ReturnType<typeof fetchProductList>>, ProductListResponse>>
export type _DetailReturn = Expect<Equal<Awaited<ReturnType<typeof getProduct>>, ProductDetailResponse>>
export type _RecommendationReturn = Expect<
  Equal<Awaited<ReturnType<typeof listRecommendations>>, ProductRecommendationsResponse>
>
export type _PurchaseReturn = Expect<Equal<Awaited<ReturnType<typeof checkPurchase>>, PurchaseCheckResponse>>

// —— ApiError 携带错误信封，基址是 string ——
export type _ApiErrorStatus = Expect<Equal<ApiError['status'], number>>
export type _ApiErrorBody = Expect<Equal<ApiError['error'], ErrorResponse | undefined>>
export type _BaseUrl = Expect<Equal<typeof apiBaseUrl, string>>

// —— 穷尽检查的返回类型 ——
export type _Summary = Expect<Equal<ReturnType<typeof describePurchaseResult>, string>>

/**
 * 汇总所有断言。本项目未开 `noUnusedLocals`，显式导出是为了让这些别名
 * 在编辑器与检索里可见，而不是被当成死代码。
 */
export type ContractTypeTests =
  | _Page
  | _PageSize
  | _Total
  | _TotalPages
  | _Items
  | _HighlightFields
  | _HighlightFragments
  | _ListHighlight
  | _SearchListItemBase
  | _DisplayPrice
  | _DisplayOriginalPrice
  | _SoldOut
  | _Rating
  | _Sales
  | _ListItemCategory
  | _ListItemCover
  | _CoverImage
  | _Category
  | _CategoryListItem
  | _CategoriesItems
  | _RecommendationItems
  | _SuggestionItems
  | _SuggestionBase
  | _SuggestionHighlight
  | _SuggestionHighlightFields
  | _SuggestionFragments
  | _SuggestionError
  | _DetailStock
  | _DetailImages
  | _DetailDimensions
  | _DetailVariants
  | _DetailBlocks
  | _DimensionOptions
  | _VariantSku
  | _VariantPrice
  | _VariantOriginalPrice
  | _VariantStock
  | _TextBlock
  | _ImageBlock
  | _CheckProduct
  | _CheckVariant
  | _ResultTags
  | _ReasonTags
  | _RequestedPrice
  | _PurchasablePriceChanged
  | _ErrorCode
  | _ErrorMessage
  | _ErrorDetails
  | _ListArg
  | _ListSort
  | _ListPage
  | _ListKeyword
  | _DetailPath
  | _RecommendationPath
  | _DetailArg
  | _DetailSignal
  | _RecommendationArg
  | _RecommendationSignal
  | _PurchaseArg
  | _PurchaseBody
  | _ListError
  | _DetailError
  | _RecommendationError
  | _CategoriesError
  | _PurchaseError
  | _ListReturn
  | _DetailReturn
  | _RecommendationReturn
  | _PurchaseReturn
  | _ApiErrorStatus
  | _ApiErrorBody
  | _BaseUrl
  | _Summary

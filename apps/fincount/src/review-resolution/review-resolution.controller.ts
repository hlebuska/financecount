import { Body, Controller, Post } from '@nestjs/common';
import { ReviewResolutionService } from './review-resolution.service';
import { ResolveCategoryReviewDto } from './dto/resolve-category-review.dto';

@Controller('review-resolution')
export class ReviewResolutionController {
  constructor(private readonly reviewResolutionService: ReviewResolutionService) {}

  @Post('category')
  resolveCategoryReview(@Body() dto: ResolveCategoryReviewDto) {
    return this.reviewResolutionService.resolveCategoryReview(dto);
  }
}